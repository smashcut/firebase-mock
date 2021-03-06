'use strict';

var _      = require('lodash');
var format = require('util').format;
var Promise   = require('rsvp').Promise;

function FirebaseAuth () {
  this.currentUser = null;
  this._auth = {
    listeners: [],
    completionListeners: [],
    users: {},
    uidCounter: 1
  };
}

FirebaseAuth.prototype.changeAuthState = function (userData) {
  this._defer('changeAuthState', _.toArray(arguments), function() {
    if (!_.isEqual(this.currentUser, userData)) {
      this.currentUser = _.isObject(userData) ? userData : null;
      this._triggerAuthEvent();
    }
  });
};

FirebaseAuth.prototype.onAuthStateChanged = function (callback) {
  var self = this;
  var currentUser = this.currentUser;
  this._auth.listeners.push({fn: callback});

  defer();
  return destroy;

  function destroy() {
    self.offAuth(callback);
  }

  function defer() {
    self._defer('onAuthStateChanged', _.toArray(arguments), function() {
      if (!_.isEqual(self.currentUser, currentUser)) {
        self._triggerAuthEvent();
      }
    });
  }
};

FirebaseAuth.prototype.getUserByEmail = function (email, onComplete) {
  var err = this._nextErr('getUserByEmail');
  var users = this._auth.users;
  var self = this;
  return new Promise(function (resolve, reject) {
    var user = null;
    err = err || self._validateExistingEmail({
      email: email
    });
    if (!err) {
      user = _.clone(users[email]);
      if (onComplete) {
        onComplete(err, user);
      }
      resolve(user);
    } else {
      if (onComplete) {
        onComplete(err, null);
      }
      reject(err);
    }
  });
};

FirebaseAuth.prototype.getUser = function (uid, onComplete) {
  var err = this._nextErr('getUser');
  var users = this._auth.users;
  var self = this;
  return new Promise(function (resolve, reject) {
    var user = null;
    err = err || self._validateExistingUid({
      uid: uid
    });
    if (!err) {
      user = _.find(users, function(u) {
        return u.uid == uid;
      });
      user = _.clone(user);
      if (onComplete) {
        onComplete(err, user);
      }
      resolve(user);
    } else {
      if (onComplete) {
        onComplete(err, null);
      }
      reject(err);
    }
  });
};

// number of arguments
var authMethods = {
  authWithCustomToken: 2,
  authAnonymously: 1,
  authWithPassword: 2,
  authWithOAuthPopup: 2,
  authWithOAuthRedirect: 2,
  authWithOAuthToken: 3
};

Object.keys(authMethods)
  .forEach(function (method) {
    var length = authMethods[method];
    var callbackIndex = length - 1;
    FirebaseAuth.prototype[method] = function () {
      this._authEvent(method, arguments[callbackIndex]);
    };
  });

var signinMethods = {
  signInWithCustomToken: function(authToken) {
    return {
      isAnonymous: false
    };
  },
  signInAnonymously: function() {
    return {
      isAnonymous: true
    };
  },
  signInWithEmailAndPassword: function(email, password) {
    return {
      isAnonymous: false,
      email: email
    };
  },
  signInWithPopup: function(provider) {
    return {
      isAnonymous: false,
      providerData: [provider]
    };
  },
  signInWithRedirect: function(provider) {
    return {
      isAnonymous: false,
      providerData: [provider]
    };
  },
  signInWithCredential: function(credential) {
    return {
      isAnonymous: false
    };
  }
};

Object.keys(signinMethods)
  .forEach(function (method) {
    var getUser = signinMethods[method];
    FirebaseAuth.prototype[method] = function () {
      var self = this;
      var user = getUser.apply(this, arguments);
      var promise = new Promise(function(resolve, reject) {
        self._authEvent(method, function(err) {
          if (err) reject(err);
          self.currentUser = user;
          resolve(user);
          self._triggerAuthEvent();
        }, true);
      });
      return promise;
    };
  });

FirebaseAuth.prototype.auth = function (token, callback) {
  console.warn('FIREBASE WARNING: FirebaseRef.auth() being deprecated. Please use FirebaseRef.authWithCustomToken() instead.');
  this._authEvent('auth', callback);
};

FirebaseAuth.prototype._authEvent = function (method, callback, defercallback) {
  var err = this._nextErr(method);
  if (!callback) return;
  if (err) {
    // if an error occurs, we defer the error report until the next flush()
    // event is triggered
    this._defer('_authEvent', _.toArray(arguments), function() {
      callback(err, null);
    });
  }
  else {
    if (defercallback) {
      this._defer(method, _.toArray(arguments), function() {
        callback();
      });
    } else {
      // if there is no error, then we just add our callback to the listener
      // stack and wait for the next changeAuthState() call.
      this._auth.completionListeners.push({fn: callback});
    }
  }
};

FirebaseAuth.prototype._triggerAuthEvent = function () {
  var completionListeners = this._auth.completionListeners;
  this._auth.completionListeners = [];
  var user = this.currentUser;
  completionListeners.forEach(function (parts) {
    parts.fn.call(parts.context, null, _.cloneDeep(user));
  });
  var listeners = _.cloneDeep(this._auth.listeners);
  listeners.forEach(function (parts) {
    parts.fn.call(parts.context, _.cloneDeep(user));
  });
};

FirebaseAuth.prototype.getAuth = function () {
  return this.currentUser;
};

FirebaseAuth.prototype.onAuth = function (onComplete, context) {
  this._auth.listeners.push({
    fn: onComplete,
    context: context
  });
  onComplete.call(context, this.getAuth());
};

FirebaseAuth.prototype.offAuth = function (onComplete, context) {
  var index = _.findIndex(this._auth.listeners, function (listener) {
    return listener.fn === onComplete && listener.context === context;
  });
  if (index > -1) {
    this._auth.listeners.splice(index, 1);
  }
};

FirebaseAuth.prototype.unauth = function () {
  if (this.currentUser !== null) {
    this.currentUser = null;
    this._triggerAuthEvent();
  }
};

FirebaseAuth.prototype.signOut = function () {
  var self = this, updateuser = this.currentUser !== null;
  var promise = new Promise(function(resolve, reject) {
    self._authEvent('signOut', function(err) {
      if (err) reject(err);
      self.currentUser = null;
      resolve();

      if (updateuser) {
        self._triggerAuthEvent();
      }
    }, true);
  });
  return promise;
};

FirebaseAuth.prototype.createUserWithEmailAndPassword = function (email, password) {
  return this._createUser('createUserWithEmailAndPassword', {
    email: email,
    password: password
  });
};

FirebaseAuth.prototype.createUser = function (credentials, onComplete) {
  validateCredentials('createUser', credentials, [
    'email',
    'password'
  ]);
  return this._createUser('createUser', credentials, onComplete);
};

FirebaseAuth.prototype._createUser = function (method, credentials, onComplete) {
  var err = this._nextErr(method);
  var users = this._auth.users;
  var self = this;
  return new Promise(function (resolve, reject) {
    self._defer(method, _.toArray(arguments), function () {
      var user = null;
      err = err || self._validateNewEmail(credentials);
      err = err || self._validateNewUid(credentials);
      if (!err) {
        var key = credentials.email;
        users[key] = {
          uid: credentials.uid || self._nextUid(),
          email: key,
          password: credentials.password
        };
        user = {
          uid: users[key].uid,
          email: key
        };
        if (onComplete) {
          onComplete(err, user);
        }
        resolve(user);
      } else {
        if (onComplete) {
          onComplete(err, null);
        }
        reject(err);
      }
    });
  });
};

FirebaseAuth.prototype.changeEmail = function (credentials, onComplete) {
  validateCredentials('changeEmail', credentials, [
    'oldEmail',
    'newEmail',
    'password'
  ]);
  var err = this._nextErr('changeEmail');
  this._defer('changeEmail', _.toArray(arguments), function () {
    err = err ||
      this._validateExistingEmail({
        email: credentials.oldEmail
      }) ||
      this._validPass({
        password: credentials.password,
        email: credentials.oldEmail
      }, 'password');
    if (!err) {
      var users = this._auth.users;
      var user = users[credentials.oldEmail];
      delete users[credentials.oldEmail];
      user.email = credentials.newEmail;
      users[user.email] = user;
    }
    onComplete(err);
  });
};

FirebaseAuth.prototype.changePassword = function (credentials, onComplete) {
  validateCredentials('changePassword', credentials, [
    'email',
    'oldPassword',
    'newPassword'
  ]);
  var err = this._nextErr('changePassword');
  this._defer('changePassword', _.toArray(arguments), function () {
    err = err ||
      this._validateExistingEmail(credentials) ||
      this._validPass(credentials, 'oldPassword');
    if (!err) {
      var key = credentials.email;
      var user = this._auth.users[key];
      user.password = credentials.newPassword;
    }
    onComplete(err);
  });
};

FirebaseAuth.prototype.removeUser = function (credentials, onComplete) {
  validateCredentials('removeUser', credentials, [
    'email',
    'password'
  ]);
  var err = this._nextErr('removeUser');
  this._defer('removeUser', _.toArray(arguments), function () {
    err = err ||
      this._validateExistingEmail(credentials) ||
      this._validPass(credentials, 'password');
    if (!err) {
      delete this._auth.users[credentials.email];
    }
    onComplete(err);
  });
};

FirebaseAuth.prototype.resetPassword = function (credentials, onComplete) {
  validateCredentials('resetPassword', credentials, [
    'email'
  ]);
  var err = this._nextErr('resetPassword');
  this._defer('resetPassword', _.toArray(arguments), function() {
    err = err ||
      this._validateExistingEmail(credentials);
    onComplete(err);
  });
};

FirebaseAuth.prototype._nextUid = function () {
  return 'simplelogin:' + (this._auth.uidCounter++);
};

FirebaseAuth.prototype._validateNewUid = function (credentials) {
  if (credentials.uid) {
    var user = _.find(this._auth.users, function(user) {
      return user.uid == credentials.uid;
    });
    if (user) {
      var err = new Error('The provided uid is already in use by an existing user. Each user must have a unique uid.');
      err.code = 'auth/uid-already-exists';
      return err;
    }
  }
  return null;
};

FirebaseAuth.prototype._validateExistingUid = function (credentials) {
  if (credentials.uid) {
    var user = _.find(this._auth.users, function(user) {
      return user.uid == credentials.uid;
    });
    if (!user) {
      var err = new Error('There is no existing user record corresponding to the provided identifier.');
      err.code = 'auth/user-not-found';
      return err;
    }
  }
  return null;
};

FirebaseAuth.prototype._validateNewEmail = function (credentials) {
  if (this._auth.users.hasOwnProperty(credentials.email)) {
    var err = new Error('The provided email is already in use by an existing user. Each user must have a unique email.');
    err.code = 'auth/email-already-exists';
    return err;
  }
  return null;
};

FirebaseAuth.prototype._validateExistingEmail = function (credentials) {
  if (!this._auth.users.hasOwnProperty(credentials.email)) {
    var err = new Error('There is no existing user record corresponding to the provided identifier.');
    err.code = 'auth/user-not-found';
    return err;
  }
  return null;
};

FirebaseAuth.prototype._validPass = function (object, name) {
  var err = null;
  var key = object.email;
  if (object[name] !== this._auth.users[key].password) {
    err = new Error('The provided value for the password user property is invalid. It must be a string with at least six characters.');
    err.code = 'auth/invalid-password';
  }
  return err;
};

function validateCredentials (method, credentials, fields) {
  validateObject(credentials, method, 'First');
  fields.forEach(function (field) {
    validateArgument(method, credentials, 'First', field, 'string');
  });
}

function validateObject (object, method, position) {
  if (!_.isObject(object)) {
    throw new Error(format(
      'Firebase.%s failed: %s argument must be a valid object.',
      method,
      position
    ));
  }
}

function validateArgument (method, object, position, name, type) {
  if (!object.hasOwnProperty(name) || typeof object[name] !== type) {
    throw new Error(format(
      'Firebase.%s failed: %s argument must contain the key "%s" with type "%s"',
      method,
      position,
      name,
      type
    ));
  }
}

module.exports = FirebaseAuth;

const helpers = require("../helpers");
const envelopeEncryption = require("../crypto/envelope-encryption");
const secretUtil = require("./secret-util");
const SecretUser = require("./secret-user").SecretUser;
const SecretFile = require("./secret-file").SecretFile;
const pem = require("pem");

const VERSION = 1;

function SecretFilesystem(options) {
  var onLoadComplete = options.onLoadComplete;
  this.keyService = options.keyService;
  this.storageService = options.storageService;
  this.keyId = options.keyId;
  this.keySpec = options.keySpec;
  this.sslCA = options.sslCA;
  
  this._files = new Map();
  this._users = new Map();
  
  // Mimics API of SecretFile
  this.fileRoot = {
    path: "/",
    id: "",
    _value: "Secret server root directory",
    contentType: "text/plain",
    createdAt: new Date(),
    isDirectory: true
  };
  this.fileRoot.etag = secretUtil.getMd5(this.fileRoot._value);
  this.fileRoot.contentLength = Buffer.byteLength(this.fileRoot._value);
  this.fileRoot.modifiedAt = new Date(+(this.fileRoot.createdAt));
  this.fileRoot.getValue = function(callback) {
    callback(null, this.value);
  };
  
  setImmediate(() => {
    this.storageService.load((err, data) => {
      var i, nCallbacks, finished = false;
    
      if (err) {
        finish(err);
        return;
      }
      if (!data.files || !Array.isArray(data.files)) {
        finish(new Error("Missing files data"));
        return;
      }
      if (!data.users || !Array.isArray(data.users)) {
        finish(new Error("Missing users data"));
        return;
      }
  
      nCallbacks = data.files.length + data.users.length;
  
      for (i = 0; i < data.files.length; i++) {
        loadItem(new SecretFile(data.files[i].main, data.files[i].groups, this), this._files);
      }
      for (i = 0; i < data.users.length; i++) {
        loadItem(new SecretUser(data.users[i].main, data.users[i].groups, this), this._users);
      }
    
      if (nCallbacks === 0) {
        finish();
      }
      
      function loadItem(item, map) {
        item.load(function(err) {
          nCallbacks--;
          if (err) {
            finish(err);
            return;
          }
          if (map.has(item.id.toLowerCase())) {
            finish(new Error("Duplicate item"));
            return;
          }
          map.set(item.id.toLowerCase(), item);
          if (nCallbacks === 0) {
            finish();
          }
        });
      }
      
      function finish(err) {
        if (finished) {
          return;
        }
        finished = true;
        if (onLoadComplete) {
          onLoadComplete(err);
        }
      }
    
    });
  });
}

Object.defineProperties(SecretFilesystem.prototype, {
  userCount: {
    configurable: true,
    enumerable: true,
    get: function() {
      return this._users.size;
    }
  },
  fileCount: {
    configurable: true,
    enumerable: true,
    get: function() {
      return this._files.size;
    }
  },
  adminUserCount: {
    configurable: true,
    enumerable: true,
    get: function() {
      var result = 0;
      this.forEachUser(function(user) {
        if (user.role === "admin") {
          result++;
        }
      });
      return result;
    }
  }
});

SecretFilesystem.prototype.forEachFile = function(fn) {
  this._files.forEach(fn);
};

SecretFilesystem.prototype.forEachUser = function(fn) {
  this._users.forEach(fn);
};

SecretFilesystem.prototype.userForEachFile = function(user, fn) {
  this._files.forEach(function(file) {
    if (secretUtil.setsIntersect(file.groups, user.groups)) {
      fn(file);
    }
  });
};

SecretFilesystem.prototype.hasFile = function(path) {
  return this.getFile(path) !== null;
};

SecretFilesystem.prototype.userHasFile = function(user, path) {
  return this.userGetFile(user, path) !== null;
};

SecretFilesystem.prototype.getFile = function(path) {
  
  if (!path || !path.length || path === "/") {
    return this.fileRoot;
  }
  
  if (path.substr(0, 1) === "/") {
    path = path.slice(1);
  }
  return this._files.get(path.toLowerCase()) || null;
};

SecretFilesystem.prototype.userGetFile = function(user, path) {
  var file;
  
  if (!path || !path.length || path === "/") {
    return this.fileRoot;
  }
  
  if (!user) {
    return null;
  }
  
  if (path.substr(0, 1) === "/") {
    path = path.slice(1);
  }
  file =  this._files.get(path.toLowerCase());
  if (!file || !secretUtil.setsIntersect(file.groups, user.groups)) {
    return null;
  }
  return file;
};

SecretFilesystem.prototype.hasUser = function(id) {
  return this.getUser(id) !== null;
};

SecretFilesystem.prototype.getUser = function(id) {
  if (id == null || !id.length) {
    return null;
  }
  return this._users.get(id.toLowerCase()) || null;
};

SecretFilesystem.prototype.getUserForCert = function(cert) {
  var user, emailAddress = helpers.getEmailFromCert(cert);
  if (!cert || !cert.fingerprint || !cert.subject || !emailAddress || !cert.subject.CN) {
    return null;
  }
  user = this.getUser(emailAddress);
  if (!user) {
    return null;
  }
  if (user.name.toLowerCase() !== cert.subject.CN.toLowerCase()) {
    return null;
  }
  if (user.certFingerprint.toLowerCase() !== cert.fingerprint.toLowerCase()) {
    return null;
  }
  return user;
};

SecretFilesystem.prototype.encrypt = function(dataBuffer, aad, embedAad, callback) {
  envelopeEncryption.encrypt(this.keyId, this.keySpec, this.keyService, dataBuffer, aad, embedAad, callback);
};

SecretFilesystem.prototype.decrypt = function(dataBuffer, aad, callback) {
  envelopeEncryption.decrypt(this.keyService, dataBuffer, aad, callback);
};

SecretFilesystem.prototype.addUser = function(data, callback) {
  this._addItem(data, SecretUser, this._users, "users", callback);
};

SecretFilesystem.prototype.addFile = function(data, callback) {
  if (data.fileData instanceof Buffer) {
    data.contentLength = data.fileData.length;
  }
  if (!data.createdAt) {
    data.createdAt = new Date();
  }
  if (!data.modifiedAt) {
    data.modifiedAt = new Date(data.createdAt instanceof Date ? +data.createdAt : null);
  }
  this._addItem(data, SecretFile, this._files, "files", callback);
};

SecretFilesystem.prototype.updateFileGroups = function(id, groups, callback) {
  this._updateItemGroups(this.getFile(id), groups, "files", callback);
};

SecretFilesystem.prototype.updateUserGroups = function(id, groups, callback) {
  this._updateItemGroups(this.getUser(id), groups, "users", callback);
};

SecretFilesystem.prototype.updateUserData = function(update, callback) {
  this._updateItemData(this.getUser(update.id), update, SecretUser, "users", callback);
};

SecretFilesystem.prototype._addItem = function(data, ItemConstructor, targetMap, itemStorageType, callback) {
  var aad;
  
  callback = callback || helpers.noop;
  
  try {
    ItemConstructor.validateData(data);
  } catch (e) {
    callback(e);
    return;
  }
  
  if (!secretUtil.isValidGroupSet(data.groups)) {
    callback(new helpers.WebError(400, "Invalid group set"));
  }
  
  if (targetMap.has(data.id)) {
    callback(new helpers.WebError(400, "Item with this id already exists"));
    return;
  }
  
  aad = ItemConstructor.encodeAad(data);
  
  this.encrypt(ItemConstructor.bufferToEncrypt(data), aad, true, (err, encryptedBlob) => {
    if (err) {
      callback(err);
      return;
    }
    this.encrypt(secretUtil.bufferFromGroups(data.groups), {id: data.id}, false, (err, encryptedGroups) => {
      var newItem;
      
      if (err) {
        callback(err);
        return;
      }
      
      newItem = new ItemConstructor(encryptedBlob, encryptedGroups, this);
      
      if (targetMap.has(data.id)) {
        callback(new helpers.WebError(400, "Item with this id already exists"));
        return;
      }
      
      newItem.groups = new Set(data.groups);
      newItem.populateFromAad(aad);
      newItem.extendFromOriginalData(data);
  
      this.storageService.addItem(newItem.id, itemStorageType, newItem.encryptedBlob, newItem.encryptedGroups, (err) => {
        if (err) {
          callback(err);
          return;
        }
        targetMap.set(newItem.id, newItem);
        callback(null, newItem);
      });
    });
  });
};


SecretFilesystem.prototype._updateItemGroups = function(item, groups, itemStorageType, callback) {
  callback = callback || helpers.noop;
  
  if (!item) {
    callback(new helpers.WebError(404, "Item does not exist"));
    return;
  }
  if (!secretUtil.isValidGroupSet(groups)) {
    callback(new helpers.WebError(400, "Invalid group set"));
    return;
  }
  
  this.encrypt(secretUtil.bufferFromGroups(groups), {id: item.id}, false, (err, encryptedGroups) => {
    if (err) {
      callback(err);
      return;
    }
    
    this.storageService.updateGroupData(item.id, itemStorageType, encryptedGroups, (err) => {
      if (err) {
        callback(err);
        return;
      }
      
      item.groups = new Set(groups);
      item.encryptedGroups = encryptedGroups;
      
      callback(null, item);
      
    });
  });
  
};

SecretFilesystem.prototype._updateItemData = function(item, update, ItemConstructor, itemStorageType, callback) {
  var aad, data, key;
  
  callback = callback || helpers.noop;
  
  if (!item) {
    callback(new helpers.WebError(404, "Item does not exist"));
    return;
  }
  
  data = item.cloneData();
  for (key in update) {
    if (update.hasOwnProperty(key) && data.hasOwnProperty(key) && key !== "id") {
      data[key] = update[key];
    }
  }
  
  try {
    ItemConstructor.validateData(data);
  } catch (e) {
    callback(e);
    return;
  }
  
  aad = ItemConstructor.encodeAad(data);
  
  this.encrypt(ItemConstructor.bufferToEncrypt(data), aad, true, (err, encryptedBlob) => {
    if (err) {
      callback(err);
      return;
    }
    this.storageService.updateMainData(item.id, itemStorageType, encryptedBlob, (err) => {
      if (err) {
        callback(err);
        return;
      }
      
      item.encryptedBlob = encryptedBlob;
      item.populateFromAad(aad);
      item.extendFromOriginalData(data);
  
      callback(null);
    });
  });
};


SecretFilesystem.prototype.getGroups = function() {
  var result = new Set();
  
  this.forEachFile(addGroups);
  this.forEachUser(addGroups);
  
  return result;
  
  function addGroups(item) {
    if (!item.groups) {
      return;
    }
    for (let groupName of item.groups) {
      result.add(groupName);
    }
  }
};

SecretFilesystem.prototype.getCertificateInfo = function(fileData, callback) {
  pem.readCertificateInfo(fileData, (err, certInfo) => {
    if (err) {
      callback(err);
      return;
    }
    pem.getFingerprint(fileData, "sha1", (err, oCertFingerprint) => {
      if (err) {
        callback(err);
        return;
      }
      pem.verifySigningChain(fileData, this.sslCA, (err, isVerified) => {
        var email;
        
        if (err) {
          callback(err);
          return;
        }
        
        if (certInfo.san && certInfo.san.email && certInfo.san.email.length) {
          email = certInfo.san.email[0];
        } else {
          email = certInfo.emailAddress;
        }
        callback(null, {
          isVerified: isVerified,
          certFingerprint: (oCertFingerprint.fingerprint || "").toUpperCase(),
          emailAddress: (email || "").toLowerCase(),
          commonName: certInfo.commonName,
          validStart: new Date(certInfo.validity.start),
          validEnd: new Date(certInfo.validity.end),
          isValidNow: (certInfo.validity.start <= Date.now() && certInfo.validity.end >= Date.now())
        });
      });
    });
  })
};

exports.SecretFilesystem = SecretFilesystem;


const util = require("util");
const secretUtil = require("./secret-util");
const SecretItemBase = require("./secret-item-base").SecretItemBase;
const helpers = require("../helpers");

const VERSION = 1;

function SecretUser(encryptedBlob, encryptedGroups, parent) {
  SecretItemBase.call(this, encryptedBlob, encryptedGroups, parent);
}
util.inherits(SecretUser, SecretItemBase);

SecretUser.prototype.extractMain = function(callback) {
  this.parent.decrypt(this.encryptedBlob, null, (err, fingerprintBuffer, aad) => {
    if (err) {
      callback(err);
      return;
    }
  
    this.populateFromAad(aad);
    this.certFingerprint = fingerprintBuffer.toString();
    
    callback(null);
  });
};

SecretUser.prototype.populateFromAad = function(aad) {
  this.v = parseInt(aad.v);
  this.id = aad.id;
  this.name = aad.name;
  this.role = aad.role;
  this.validStart = new Date(parseInt(aad.validStart));
  this.validEnd = new Date(parseInt(aad.validEnd));
};

SecretUser.prototype.cloneData = function() {
  return {
    v: this.v,
    id: this.id,
    name: this.name,
    role: this.role,
    validStart: new Date(+this.validStart),
    validEnd: new Date(+this.validEnd),
    certFingerprint: this.certFingerprint
  };
};

SecretUser.prototype.extendFromOriginalData = function(obj) {
  this.certFingerprint = obj.certFingerprint;
};

SecretUser.encodeAad = function(obj) {
  return {
    v: (obj.v == null ? VERSION : obj.v).toString(),
    id: obj.id,
    name: obj.name,
    role: obj.role,
    validStart: (+obj.validStart).toString(),
    validEnd: (+obj.validEnd).toString()
  };
};

SecretUser.bufferToEncrypt = function(obj) {
  return Buffer.from(obj.certFingerprint);
};

SecretUser.isValidUserId = function(value) {
  if (typeof value !== "string") {
    return false;
  }
  if (value.length < 1 || value.length > 64) {
    return false;
  }
  return isEmailAddress(value);
};

SecretUser.isValidUserName = function(value) {
  if (typeof value !== "string") {
    return false;
  }
  return !(value.length < 1 || value.length > 64);
};

SecretUser.isValidCertFingerprint = function(value) {
  if (typeof value !== "string") {
    return false;
  }
  return /^([A-F0-9][A-F0-9]:){19}[A-F0-9][A-F0-9]$/.test(value);
};

SecretUser.isValidDateSet = function(validStart, validEnd) {
  if (!(validStart instanceof Date && validEnd instanceof Date)) {
    return false;
  }
  return +validEnd > +validStart;
};

SecretUser.isValidRole = function(role) {
  if (typeof role !== "string") {
    return false;
  }
  return (role === "admin" || role === "user");
};

SecretUser.validateData = function(item) {
  
  if (!SecretUser.isValidUserId(item.id)) {
    throw new helpers.WebError(400, "Invalid email address");
  }
  
  if (!SecretUser.isValidUserName(item.name)) {
    throw new helpers.WebError(400, "Invalid name");
  }
  
  if (!SecretUser.isValidRole(item.role)) {
    throw new helpers.WebError(400, "Invalid role");
  }
  
  if (!SecretUser.isValidDateSet(item.validStart, item.validEnd)) {
    throw new helpers.WebError(400, "Invalid start or end date");
  }
  
  if (!SecretUser.isValidCertFingerprint(item.certFingerprint)) {
     throw new helpers.WebError(400, "The certificate fingerprint is not compatible with this service");
  }
  
};

function isEmailAddress(address) {
  return address.match(/^(([a-zA-Z0-9][a-zA-Z0-9._%+-]*[a-zA-Z0-9])|([a-zA-Z0-9]))@[a-zA-Z0-9][a-zA-Z0-9.-]*[a-zA-Z0-9]\.[a-zA-Z]{2,63}$/);
}

exports.SecretUser = SecretUser;

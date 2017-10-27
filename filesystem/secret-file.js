const util = require("util");
const SecretItemBase = require("./secret-item-base").SecretItemBase;
const envelopeEncryption = require("../crypto/envelope-encryption");
const secretUtil = require("./secret-util");
const helpers = require("../helpers");

const VERSION = 2;

function SecretFile(encryptedBlob, encryptedGroups, parent) {
  SecretItemBase.call(this, encryptedBlob, encryptedGroups, parent);
}
util.inherits(SecretFile, SecretItemBase);

SecretFile.prototype.extractMain = function(callback) {
  try {
    this.populateFromAad(envelopeEncryption.extractAad(this.encryptedBlob));
  } catch (e) {
    callback(e);
    return;
  }
  callback();
};

SecretFile.prototype.populateFromAad = function(aad) {
  this.v = parseInt(aad.v);
  this.id = aad.id;
  this.contentLength = parseInt(aad.contentLength);
  this.createdAt = new Date(parseInt(aad.createdAt));
  this.modifiedAt = new Date(parseInt(aad.modifiedAt));
  
  if (this.v === 1) {
    this.contentType = "text/plain"
  } else {
    this.contentType = aad.contentType;
  }
  
  this._etag = null;
  this.path = "/" + this.id;
  this.isDirectory = false;
};

SecretFile.prototype.getValue = function(callback) {
  this.parent.decrypt(this.encryptedBlob, SecretFile.encodeAad(this), function(err, decrypted) {
    if (err) {
      callback(err);
      return;
    }
    callback(null, decrypted);
  });
};

Object.defineProperties(SecretFile.prototype, {
  etag: {
    configurable: true,
    enumerable: true,
    get: function() {
      if (this._etag == null) {
        this._etag = secretUtil.getMd5(this.encryptedBlob);
      }
      return this._etag;
    }
  }
});

SecretFile.encodeAad = function (obj) {
  var result = {
    v: (obj.v == null ? VERSION : obj.v).toString(),
    id: obj.id,
    contentLength: obj.contentLength.toString(),
    createdAt: (+obj.createdAt).toString(),
    modifiedAt: (+obj.modifiedAt).toString()
  };
  
  if (result.v > 1) {
    result.contentType = obj.contentType || "text/plain";
  }
  
  return result;
};

SecretFile.isValidFileName = function(name) {
  if (typeof name !== "string") {
    return false;
  }
  if (name.length < 1 || name.length > 64) {
    return false;
  }
  return /^[a-z0-9_]+[a-z0-9_.-]*$/.test(name);
};

SecretFile.isValidContentType = function(contentType) {
  if (typeof contentType !== "string") {
    return false;
  }
  if (contentType.length < 1 || contentType.length > 128) {
    return false;
  }
  return /^[a-zA-Z0-9_-]+\/[a-zA-Z0-9_.*-]+$/.test(contentType);
};


SecretFile.isValidFileBuffer = function(buf) {
  if (!(buf instanceof Buffer)) {
    return false;
  }
  return buf.length <= 128 * 1024;
};

SecretFile.bufferToEncrypt = function(data) {
  return data.fileData;
};

SecretFile.validateData = function(item) {
  
  if (!SecretFile.isValidFileName(item.id)) {
    throw new helpers.WebError(400, "Invalid name");
  }
  
  if (!SecretFile.isValidFileBuffer(item.fileData)) {
    throw new helpers.WebError(400, "Invalid file");
  }
  
  if (!SecretFile.isValidContentType(item.contentType)) {
    throw new helpers.WebError(400, "Invalid contentType");
  }
  
};


exports.SecretFile = SecretFile;
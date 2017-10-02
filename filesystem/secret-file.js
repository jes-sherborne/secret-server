const util = require("util");
const SecretItemBase = require("./secret-item-base").SecretItemBase;
const envelopeEncryption = require("../crypto/envelope-encryption");
const secretUtil = require("./secret-util");
const helpers = require("../helpers");

const VERSION = 1;

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
  
  this._etag = null;
  this.path = "/" + this.id;
  this.isDirectory = false;
  this.contentType = "text/plain";
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
  return {
    v: (obj.v == null ? VERSION : obj.v).toString(),
    id: obj.id,
    contentLength: obj.contentLength.toString(),
    createdAt: (+obj.createdAt).toString(),
    modifiedAt: (+obj.modifiedAt).toString()
  };
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
  
};


exports.SecretFile = SecretFile;
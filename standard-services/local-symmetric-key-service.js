const crypto = require("crypto");
const authenticatedEncryption = require("../crypto/authenticated-encryption");
const cryptoUtil = require("../crypto/crypto-util");

/**************************************************************
 This is an adequate implementation for low-risk secrets and testing.
 Don't use this for anything you care about.
 **********************************************************/

function LocalSymmetricKeyService(options) {
  var _keyId = options.keyId;
  var _algorithm = options.algorithm;
  var _key = Buffer.from(options.secretKey, options.secretKeyEncoding || null);
  
  if (typeof _keyId !== "string" || _keyId.length < 1) {
    throw new Error("Invalid keyId. Must be a string of at least 1 character.");
  }
  if (!cryptoUtil.ALGORITHMS.hasOwnProperty(_algorithm)) {
    throw new Error("Unknown algorithm");
  }
  if (_key.length !== cryptoUtil.ALGORITHMS[_algorithm].keyLength) {
    throw new Error("secretKey is the wrong length for the selected algorithm. Must be " + cryptoUtil.ALGORITHMS[_algorithm].keyLength + " bytes");
  }
  
  this.generateDataKey = function(keyId, lengthInBytes, callback) {
    var dataKey;
    
    if (keyId !== _keyId) {
      callback(new Error("Invalid keyId"));
      return;
    }
  
    dataKey = crypto.randomBytes(lengthInBytes);
  
    authenticatedEncryption.encrypt(dataKey, _keyId, _key, _algorithm, null, false, function(err, encryptedBlob) {
      if (err) {
        callback(err);
        return;
      }
      callback(null, dataKey, encryptedBlob);
    });
  };
  
  this.decrypt = function(encryptedBlob, callback) {
    var keyId;
    
    try {
      keyId = authenticatedEncryption.extractKeyId(encryptedBlob);
      if (keyId !== _keyId) {
        callback(new Error("Unknown keyId"));
        return;
      }
      authenticatedEncryption.decrypt(encryptedBlob, _key, null, callback);
    } catch (e) {
      callback(e);
    }
  };
}

exports.create = function(config) {
  return new LocalSymmetricKeyService(config);
};

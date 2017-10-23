const AWS = require("aws-sdk");
const helpers = require("../helpers");

/**************************************************************
 This is a straightforward application of AWS's KMS.
 The security of this method lies largely in proper configuration
 of AWS access privs.
 **********************************************************/

function AwsKmsKeyService(config) {
  config = helpers.defaults({}, config, {
    apiVersion: '2014-11-01',
    region: null,
    defaultKeyId: null
  });
  
  const kms = new AWS.KMS(config);
  this.defaultKeyId = config.defaultKeyId;
  
  this.generateDataKey = function(keyId, lengthInBytes, callback) {
    var params = {KeyId: keyId};
    
    if (lengthInBytes === 16) {
      params.KeySpec = "AES_128"
    } else if (lengthInBytes === 32) {
      params.KeySpec = "AES_256"
    } else {
      params.NumberOfBytes = lengthInBytes
    }
    
    kms.generateDataKey(params, function(err, result) {
      if (err) {
        callback(err);
        return;
      }
      callback(null, result.Plaintext, result.CiphertextBlob);
    });
  };
  
  this.decrypt = function(encryptedBlob, callback) {
    kms.decrypt({CiphertextBlob: encryptedBlob}, function(err, result) {
      if (err) {
        callback(err);
        return;
      }
      callback(null, result.Plaintext);
    });
  };
}

exports.create = function(config) {
  return new AwsKmsKeyService(config);
};

const AWS = require("aws-sdk");

/**************************************************************
 This is a straightforward application of AWS's KMS.
 The security of this method lies largely in proper configuration
 of AWS access privs.
 **********************************************************/

function AwsKmsKeyService() {
  const kms = new AWS.KMS();
  
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
      callback(null, result.CiphertextBlob, result.Plaintext);
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

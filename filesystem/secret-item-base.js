const secretUtil = require("./secret-util");

function SecretItemBase(encryptedBlob, encryptedGroups, parent) {
  this.encryptedBlob = encryptedBlob;
  this.encryptedGroups = encryptedGroups;
  this.parent = parent;
}

SecretItemBase.prototype.load = function(callback) {
  this.extractMain((err) => {
    if (err) {
      callback(err);
      return;
    }
    this.extractGroups(callback);
  });
};

SecretItemBase.prototype.extractMain = function(callback) {
  callback(new Error("Must override"));
};

SecretItemBase.prototype.extractGroups = function(callback) {
  this.parent.decrypt(this.encryptedGroups, {id: this.id}, (err, decrypted) => {
    if (err) {
      callback(err);
      return;
    }
    
    try {
      this.groups = secretUtil.groupsFromBuffer(decrypted);
    } catch (e) {
      callback(e);
      return;
    }
    callback(null);
  });
};

SecretItemBase.prototype.populateFromAad = function(aad) {
  throw new Error("Must override");
};

SecretItemBase.prototype.cloneData = function() {
  throw new Error("Must override");
};

SecretItemBase.prototype.extendFromOriginalData = function(obj) {
};

exports.SecretItemBase = SecretItemBase;
var coreData;

window.onload = function() {
  getData(function() {
    createMainUi();
    renderFileList();
    renderUserList();
  })
};

function getData(onSuccess) {
  var req = new XMLHttpRequest();
  req.responseType = "json";
  
  req.onerror = function() {
    alert("Something unexpected went wrong.");
  };
  req.onload = function(e) {
    if (e.target.status === 200) {
      coreData = req.response;
      if (onSuccess) {
        onSuccess();
      }
    } else if (e.target.status === 403) { // forbidden
      window.location.reload(true);
    } else if (e.target.responseText && e.target.responseText.length) {
      notify(e.target.responseText);
    } else {
      notify("Something unexpected went wrong.");
    }
  };
  req.open("GET", "/data");
  req.send();
}

function refreshData() {
  getData(function() {
    renderFileList();
    renderUserList();
  });
}

function createMainUi() {
  document.getElementById("main-content").innerHTML = [
    '<h2>Files</h2>',
    '<div class="button-bar">',
    '<button id="show-add-file">Add secret</button>',
    '</div>',
    '<div id="file-list"></div>',
    '<h2>Users</h2>',
    '<div class="button-bar">',
    '<button id="show-add-user">Add user</button>',
    '</div>',
    '<div id="user-list"></div>'
  ].join("");
  
  document.getElementById("show-add-file").onclick = function() {
    showDialog(
      [
        '<form action="files" method="post" enctype="multipart/form-data">',
        '<h3>Add new secret</h3>',
        '<div class="role-radio">',
        '<label><input type="radio" name="secret-type" value="file" checked>File</label>',
        '<label><input type="radio" name="secret-type" value="text">Text</label>',
        '</div>',
        '<label data-role="file-secret"><input type="file" name="file" required /></label>',
        '<label data-role="text-secret" class="hidden"><div class="caption"><strong>Secret</strong> (plain text)</div><textarea name="secret-text"></textarea></label>',
        '<label><div class="caption"><strong>Name</strong> (a-z, 0-9, period, hyphen, underscore)</div>',
        '<input type="text" name="name" minlength="1" maxlength="64" required pattern="[A-z0-9_]+[A-z0-9_.-]*"/></label>',
        '<label class="standalone"><div class="caption"><strong>Groups</strong></div></label>',
        '<div class="groups-checklist">',
        groupsToCheckboxes(),
        '</div>',
        '<label><div class="caption"><strong>Additional groups</strong> (separated by spaces)</div><textarea name="newgroups"></textarea></label>',
        '<div class="dialog-button-bar"><button type="button" class="link dialog-cancel">Cancel</button><button type="submit" class="dialog-ok">OK</button>',
        '</div>',
        '</form>'
      ].join(""),
      function(container) {
        var fileInput = container.querySelector('input[type="file"]');
        var textInput = container.querySelector('textarea[name="secret-text"]');
        var nameInput = container.querySelector('input[name="name"]');
        
        var optionFile = container.querySelector('input[name="secret-type"][value="file"]');
        var optionText = container.querySelector('input[name="secret-type"][value="text"]');
        
        var fileInputContainer = container.querySelector('[data-role="file-secret"]');
        var textInputContainer = container.querySelector('[data-role="text-secret"]');
        
        if (fileInput && nameInput) {
          fileInput.onchange = function() {
            var newName;
            if (fileInput.files[0]) {
              newName = fileInput.files[0].name.toLowerCase();
              newName = newName.replace(/^[^a-z0-9_]+/, "");
              newName = newName.replace(/\s+/g, "_");
              newName = newName.replace(/[^a-z0-9_.-]+/g, "");
              newName = newName.replace(/_{2,}/g, "_");
              newName = newName.replace(/\.{2,}/g, ".");
              newName = newName.replace(/-{2,}/g, "-");
              if (nameInput.maxLength) {
                newName = newName.slice(0, -1 + nameInput.maxLength);
              }
              nameInput.value = newName
            } else {
              nameInput.value = "";
            }
          };
        }
  
        optionFile.onchange = function() {
          fileInputContainer.classList.remove("hidden");
          fileInput.required = true;
          textInputContainer.classList.add("hidden");
          textInput.required = false;
        };
        optionText.onchange = function() {
          fileInputContainer.classList.add("hidden");
          fileInput.required = false;
          textInputContainer.classList.remove("hidden");
          textInput.required = true;
        };
  
      }
    );
  };
  
  document.getElementById("show-add-user").onclick = function() {
    showDialog([
      '<form action="users" method="post" enctype="multipart/form-data">',
      '<h3>Add new user</h3>',
      '<label><div class="caption"><strong>User certificate</strong> (e.g., john_doe.cert.pem)</div><input type="file" name="file" required /></label>',
      '<label class="standalone"><div class="caption"><strong>Role</strong></div></label>',
      '<div class="role-radio">',
      '<label><input type="radio" name="role" value="admin">Admin</label>',
      '<label><input type="radio" name="role" value="user" checked>User</label>',
      '</div>',
      '<label class="standalone"><div class="caption"><strong>Groups</strong></div></label>',
      '<div class="groups-checklist">',
      groupsToCheckboxes(),
      '</div>',
      '<label><div class="caption"><strong>Additional groups</strong> (separated by spaces)</div><textarea name="newgroups"></textarea></label>',
      '<div class="dialog-button-bar"><button type="button" class="link dialog-cancel">Cancel</button><button type="submit" class="dialog-ok">OK</button>',
      '</div>',
      '</form>'
    ].join(""));
  };
  
  document.getElementById("file-list").onclick = function(e) {
    if (e.target.classList.contains("edit")) {
      editItemGroups(e.target.getAttribute("data-target-id"), coreData.files, "file-groups");
    }
  };
  
  document.getElementById("user-list").onclick = function(e) {
    if (e.target.classList.contains("edit")) {
      switch (e.target.getAttribute("data-edit-type")) {
        case "groups":
          editItemGroups(e.target.getAttribute("data-target-id"), coreData.users, "user-groups");
          break;
        case "cert":
          editUserData(e.target.getAttribute("data-target-id"), coreData.users, "user-data");
          break;
      }
    }
  };
}

function renderFileList() {
  var html = [];
  html.push('<table class="standard">');
  html.push('<thead><tr><td>Name</td><td>Created at</td><td>Groups</td></tr></thead>');
  html.push('<tbody');
  coreData.files.forEach(function(file) {
    html.push('<tr><td>' + toHtml(file.id) + '</td><td>' + (new Date(file.createdAt)).toLocaleString() + '</td><td>' + groupsToHtml(file) + '</td></tr>');
  });
  html.push('</tbody');
  html.push('</table>');
  document.getElementById("file-list").innerHTML = html.join("");
}

function renderUserList() {
  var html = [];
  html.push('<table class="standard">');
  html.push('<thead><tr><td>Name</td><td>email</td><td>Role</td><td>Certificate</td><td>Groups</td></tr></thead>');
  html.push('<tbody');
  coreData.users.forEach(function(user) {
    html.push('<tr>');
    html.push('<td>' + toHtml(user.name) + '</td>');
    html.push('<td>' + toHtml(user.id) + '</td>');
    html.push('<td>' + toHtml(user.role) + '</td>');
    html.push('<td>');
    html.push((new Date(user.validStart)).toLocaleDateString() + ' – ' + (new Date(user.validEnd)).toLocaleDateString());
    html.push(' [' + user.certFingerprintExtract +  ']');
    html.push('<div class="edit inline-link" data-edit-type="cert" data-target-id="' + user.id + '">Edit</div>');
    html.push('</td>');
    html.push('<td>' + groupsToHtml(user) + '</td>');
    html.push('</tr>');
  });
  html.push('</tbody');
  html.push('</table>');
  document.getElementById("user-list").innerHTML = html.join("");
}

function groupsToCheckboxes(existing) {
  var html = [], oExisting = {}, i, checked, hasGroups = false;
  
  if (existing) {
    for (i = 0; i < existing.length; i++) {
      oExisting[existing[i].toLowerCase()] = true;
    }
  }
  coreData.groups.forEach(function(groupName) {
    if (oExisting[groupName.toLowerCase()] === true) {
      checked = " checked";
    } else {
      checked = "";
    }
    hasGroups = true;
    html.push('<label><input type="checkbox" name="groups" value="' + toHtml(groupName) + '"' + checked + '>' + toHtml(groupName) + '</label>');
  });
  
  if (!hasGroups) {
    html.push('<div class="no-groups">no groups defined</div>');
  }
  return html.join("");
}

function groupsToHtml(target) {
  var result;
  
  result = ['<ul class="group-list">'];
  if (target.groups && target.groups.length) {
    Array.from(target.groups).sort().forEach(function(groupName) {
      result.push('<li>' + toHtml(groupName) + '</li>');
    });
  } else {
    result.push('<li class="warning">no groups</li>');
  }
  result.push('<li class="edit"  data-edit-type="groups" data-target-id="' + target.id + '">Edit</li>');
  result.push('</ul>');
  return result.join("");
}

function editItemGroups(id, list, urlTarget) {
  var item = itemWithId(id, list);
  
  if (!item) {
    return;
  }
  showDialog([
    '<form action="' + urlTarget + '" method="post" enctype="multipart/form-data">',
    '<h3>Edit groups for ' + toHtml(id) + '</h3>',
    '<input type="hidden" name="id" value="' + id + '" />',
    '<label class="standalone"><div class="caption"><strong>Groups</strong></div></label>',
    '<div class="groups-checklist">',
    groupsToCheckboxes(item.groups),
    '</div>',
    '<label><div class="caption"><strong>Additional groups</strong> (separated by spaces)</div><textarea name="newgroups"></textarea></label>',
    '<div class="dialog-button-bar"><button type="button" class="link dialog-cancel">Cancel</button><button type="submit" class="dialog-ok">OK</button>',
    '</div>',
    '</form>'
  ].join(""));
  
}

function editUserData(id, list, urlTarget) {
  var user = itemWithId(id, list);
  
  if (!user) {
    return;
  }
  showDialog([
    '<form action="' + urlTarget + '" method="post" enctype="multipart/form-data">',
    '<h3>Edit certificate and role for ' + toHtml(id) + '</h3>',
    '<input type="hidden" name="id" value="' + id + '" />',
    '<label><div class="caption"><strong>New user certificate</strong> Optional. (e.g., john_doe.cert.pem)</div><input type="file" name="file" /></label>',
    '<label class="standalone"><div class="caption"><strong>Role</strong></div></label>',
    '<div class="role-radio">',
    '<label><input type="radio" name="role" value="admin"' + (user.role === "admin" ? ' checked' : '') + '>Admin</label>',
    '<label><input type="radio" name="role" value="user"'  + (user.role === "user" ? ' checked' : '') +  '>User</label>',
    '</div>',
    '<div class="dialog-button-bar"><button type="button" class="link dialog-cancel">Cancel</button><button type="submit" class="dialog-ok">OK</button>',
    '</div>',
    '</form>'
  ].join(""));
  
}


function itemWithId(id, list) {
  if (list == null || id == null) {
    return null;
  }
  for (var i = 0; i < list.length; i++) {
    if (list[i].id === id) {
      return list[i];
    }
  }
  return null;
}

function showDialog(formHtml, postAppend) {
  var container, fileInput, nameInput, formElement, tokenInput;
  
  container = document.createElement("div");
  container.classList.add("dialog-background");
  container.innerHTML = [
    '<div class="dialog-body">',
    formHtml,
    '</div>',
  ].join("");
  document.querySelector("body").appendChild(container);
  
  if (postAppend) {
    postAppend(container);
  }
  
  formElement = container.querySelector('form');
  
  tokenInput = document.createElement("input");
  tokenInput.type = "hidden";
  tokenInput.name = "token";
  tokenInput.value = coreData.token;
  formElement.appendChild(tokenInput);
  
  formElement.onsubmit = function(e) {
    var req, form = e.target;
  
    e.preventDefault();
  
    req = new XMLHttpRequest();
    req.open(form.method, form.action);
    req.onerror = function() {
      notify("Something went wrong");
    };
    req.onload = function(e) {
      if (e.target.status === 200) {
        container.remove();
        refreshData();
      } else if (e.target.responseText && e.target.responseText.length) {
        notify(e.target.responseText);
      } else {
        notify("Something unexpected went wrong.");
      }
    };
    function notify(text) {
      setTimeout(function() {alert(text);}, 0);
    }
    req.send(new FormData(form));
  };
  container.querySelector('button.dialog-cancel').onclick = function() {
    container.remove();
  };
}

var escapeMapForHtml = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;"
};

var htmlEncodeChars = /[\x00<>"'&]/g;

function replacerForHtml(ch) {
  return escapeMapForHtml[ch]
    // Intentional assignment that caches the result of encoding ch.
    || (escapeMapForHtml[ch] = "&#" + ch.charCodeAt(0) + ";");
}

function toHtml(value) {
  // Adapted from https://github.com/BorisMoore/jsrender
  return value != undefined ? String(value).replace(htmlEncodeChars, replacerForHtml) : "";
}

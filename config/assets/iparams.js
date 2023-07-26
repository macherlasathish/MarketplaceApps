document.addEventListener("DOMContentLoaded", appInitialized);

let key = document.querySelector('#key');
let hiddenKey = document.querySelector('#hidden-key');
let email = document.querySelector('#email');
let encrypt = document.querySelector('#encryption');

function appInitialized(){
    app.initialized().then(client =>{
        window.client = client;
        console.log("Woohoo Started");
    })
}

function getConfigs(configs){

    let { private_key, notify_email , encrypt} = configs;
    console.log("Started getConfigs");
    key.value = private_key;
    hiddenKey.value = private_key;
    email.value = notify_email;
    encryption.checked = encrypt;
    return;
}

function validate(){
    if(key.value.includes(" ")){
        return false;
    }
    else if(email.value == null || email.value == '' || !email.value.includes("@freshworks.com")){
        return false;
    }
    else return true;
}


function postConfigs(){
    if(hiddenKey.value != null && hiddenKey.value != ''){
        client.request.invoke('encryptDataKey',{new_key: key.value, old_key: hiddenKey.value});
    }
    return {
        private_key: key.value,
        notify_email: email.value,
        encrypt: encryption.checked
    }
}
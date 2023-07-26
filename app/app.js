document.addEventListener("DOMContentLoaded", appInitialized);

async function appInitialized() {
  console.log("Hello cool app has started");
  app.initialized().then(client => {
    window.client = client;
    client.events.on("app.activated", appActivated);
  }).catch(err=>console.error(JSON.stringify(err)));
}


async function appActivated() {
  const data = await client.data.get('loggedInUser');
  console.log(`${data['loggedInUser']['contact']['email']}`);
  var allowEncrypt = await client.iparams.get("encrypt");

  // Hide Encrypt button
  if(!allowEncrypt.encrypt){
    jQuery('#encrypt-pw').attr('style','display:none;');
  }

  // Auto fill logged in agent's email
  jQuery('#freshworks-email').val(data.loggedInUser.contact.email);

  
  jQuery('#verify-user').click(onVerify);
  jQuery('#encrypt-pw').click(onEncrypt);
  jQuery('#decrypt-pw').click(onDecrypt);
}

async function notify(type,title,message){
  client.interface.trigger("showNotify",{
    type:type,
    title:title,
    message:message
  });
}

async function validateEmail(email){
  if(!email.includes("@freshworks.com")){
    await notify("danger", "Error!", "This is not a Freshworks email");
    return false;
  }
  else return true;
}


async function onVerify(){
  var validEmail = await validateEmail(jQuery('#freshworks-email').val());
  if(validEmail){
    var res = await client.request.invoke('generateQR',{email: jQuery('#freshworks-email').val()});
    if(res.response.status == 200){
      if(res.response.new_user==false){
        await notify("success", "Mail sent!", "An email has been triggered to reset your 2FA creds");
      }
      else{
        await notify("success", "Mail sent!", "An email has been triggered to verify your 2FA creds");
      }
    }
    else{
      notify("danger", "Error!", "Something went wrong during verification process");
    }
  }
}


async function onEncrypt(){
  console.log("Started encryption");
  var validEmail = await validateEmail(jQuery('#freshworks-email').val());
  if(validEmail){
    return verifyUser("encrypt");
  }
}

async function onDecrypt(){
  console.log("Started decryption");
  var validEmail = await validateEmail(jQuery('#freshworks-email').val());
  console.log(validEmail);
  if(validEmail){
    return verifyUser("decrypt");
  }
}

async function verifyUser(method){
  var res = await client.request.invoke('verifyUser',{
    email:jQuery('#freshworks-email').val(), 
    password:jQuery('#password').val(), 
    otp: jQuery('#otp').val(),
    method:method
  });
  if(res.response.status == 200){
    jQuery('#output').val(res.response.output);
    await notify("success", "Success!", "Data has been " + method + "ed");
    return;
  }
  else if(res.response.status == 403 || res.response.status == 404 || res.response.status == 400){
    await notify("danger", "Error!", res.response.message);
    return;
  }

  else{
    await notify("danger", "Error!", `Something went wrong while ${method}ing the password`);
    return;
  }
}
const speakeasy = require('speakeasy');
const qrcode = require('qrcode');
const CryptoJS = require('crypto-js');


exports = {

    // Generate webhook and send it to the app notification inbox
    onAppInstallCallback : async function(data){

        console.log("OnInstallEvent Triggered");
        var webhook = await generateTargetUrl();

        await sendWebhookUrl(webhook, data.iparams.notify_email).then(function(){

            console.log(`Webhook URL sent to app admin(s)`);
            renderData(null,{});

        },function(error){

            console.log("Something went wrong while sending Webhook URL via email");
            console.error(error);

        });

    },

    onExternalEventCallback : async function(payload){
        
        // Accept Data key and store it in app DB
        $db.get(`datakey`).then(function(){

            console.log(`Data Key already present no changes have been made`);
        },function(error){

            if(error.status == 404)
            console.log(`Registering Data key`);
            
            var encryptedDataKey = CryptoJS.AES.encrypt(payload.data.data_key, payload.iparams.private_key).toString();

            $db.set(`datakey`,{
                data_key:encryptedDataKey
            }).then(function(){

                console.log("Data key successsfully encrypted and registered");

            }, function(error){

                console.error("Something went wrong while publishing Data key");
                console.error(JSON.stringify(error));

            });

        });

    },

    encryptDataKey : function(data){

        // Update data key when private key is updated
        $db.get(`datakey`).then(function(res){

            var dataKey = CryptoJS.AES.decrypt(res.data_key, data.old_key).toString(CryptoJS.enc.Utf8);
            var encryptedDataKey = CryptoJS.AES.encrypt(dataKey, data.new_key).toString();

            $db.update(`datakey`,'set',{data_key: encryptedDataKey}).then(function(){

                console.log("Data key encrypted with new private key");

            }, function(error){

                console.error("Something went wrong while re-encrypting and restoring data Key");
                console.error(JSON.stringify(error));

            });

        },function(error){

            if(error.status == 404){
                console.error("Data key not found");
            }

            else{
                console.error("Something went wrong");
                console.error(JSON.stringify(error));
            }

        });

    },

    verifyUser: async function(data){
        
        // Verify user
        if(validateEmail(data.email)){
            console.log("Started verifying user");
            $db.get(`${data.email.split("@")[0]}`).then(function(res){

                var verifyUser = speakeasy.totp.verify({
                    "secret": res.secret,
                    "encoding": "ascii",
                    "token":data.otp
                });

                if(verifyUser){

                    // Get keys
                    var privateKey = data.iparams.private_key;

                    $db.get(`datakey`).then(function(res){

                        var dataKey = CryptoJS.AES.decrypt(res.data_key, privateKey).toString(CryptoJS.enc.Utf8);

                        // Encrypt or decrypt depending on method
                        if(data.method == "encrypt"){
                        
                            console.log("Started encryption");
                            var encryptedpw = CryptoJS.AES.encrypt(data.password, dataKey).toString();
                            sendNotification(data.email, "encrypt", data.iparams.notify_email);
                            renderData(null, {status: 200, message: "Success", output: encryptedpw});

                        }
                        else if(data.method ==  "decrypt"){
                            
                            console.log("Started decryption");
                            var decryptedpw = CryptoJS.AES.decrypt(data.password, dataKey).toString(CryptoJS.enc.Utf8);
                            if(decryptedpw){
                                sendNotification(data.email, "decrypt", data.iparams.notify_email);
                                renderData(null, {status: 200, message: "Success", output: decryptedpw});
                            }
                            else{
                                renderData(null, {status: 400, message: "Please enter an encrypted value"});
                            }
                        }

                    },function(error){

                        if(error.status == 404){
                            renderData(null,{ status: 404, message: "Data Key not found"});
                        }

                        else{
                            renderData(null,{ status: error.status, message: error.message})
                        }

                    });
                }

                else renderData(null, {status: 403, message: "Invalid OTP"});
                
            }, function(error){
                
                // Request User to verify themselves
                if(error.status==404){
                    console.log("Not found");
                    renderData(null,{status: 404, message: "User has not been registered in the app, please click on verify to register your email"});
                }

                else {
                    console.log("Something went wrong while finding user secret");
                    renderData(null, {status: error.status, message:error.message});
                }
            });
            return;
        }
        else{
            renderData(null, {status:403, message:"This is not a Freshworks email"})
        }
    },


    generateQR : async function(data){

        if(validateEmail(data.email)){
            var secret = speakeasy.generateSecret({
                "name":data.email.split("@")[0] + ":freshdesk-password-manager"
            });

            $db.get(`${data.email.split("@")[0]}`).then(function(){

                $db.update(`${data.email.split("@")[0]}`,"set",{secret:secret.ascii}).then(
                    function(){
                        
                        // Generate QR code, update user secret and send email
                        console.log(`User updated for ${data.email.split("@")[0]}`);

                        qrcode.toDataURL(secret.otpauth_url, function(err, res){

                            sendVerificationEmail(data.email,res).then(function(){
                                sendNotification(data.email, "updatedUser", data.iparams.notify_email);
                                renderData(null, {status: 200, new_user: false, message:"Success"});

                            }).catch(function(err){

                                console.error(err);
                                renderData(null, {status: 500, message:err});

                            });
                        });
                    }, function(error){
                        console.error(`Something went wrong`);
                        console.error(JSON.stringify(error));
                    }
                )
            }, function(error){

                if(error.status ==404){

                    $db.set(`${data.email.split("@")[0]}`,{
                        secret: secret.ascii
                    }).then(
                        function(){

                            // Generate QR code, register user and send email
                            console.log(`User Created for ${data.email.split("@")[0]}`)
                            qrcode.toDataURL(secret.otpauth_url, function(err, res){

                                sendVerificationEmail(data.email,res).then(function(){

                                    sendNotification(data.email, "newUser", data.iparams.notify_email);
                                    renderData(null, {status: 200, new_user: true, message:"Success"});

                                }).catch(err=>console.error(err));
                            });
            
                        }, function(error){

                            console.error("Something went wrong while setting email secret");
                            console.error(JSON.stringify(error));
                            renderData(null, {status:500 , message: error.message});

                        }
                    );
                }
                else{

                    console.error(error);
                    renderData(null, {status: 500, message:error.message});

                }
            });
        }
        else{
            renderData(null, {status:403, message:"This is not a Freshworks email"});
        }
    }
}

async function sendVerificationEmail(toEmail,qrCode){

    var name = "";
    for(word of toEmail.split("@")[0].split(".")){
        name += word.charAt(0).toUpperCase() + word.slice(1) + " ";
    }
    console.log(name);
    var email = {
        "from":
        {
            "name":"Freshworks Support",
            "email":"support@freshworks.com"
        },
        "to":[
            {
                "name":name,
                "email":toEmail
            }
        ],

        "subject": "Verification for Password encryption app",
        "html":`<html><body>Hi ${name},<br><br>Please scan the attachment in this email to enable 2FA for your profile. This will help you access the encryption app.<br><br>Regards<br>Freshdesk Support</body></html>`,
        "accountId":2,
        "attachments":[
            {
                "filename":"qrCode.png",
                "content":qrCode.split(",")[1],
                "content-type":"img/png;base64"
            }
        ]
    }

    var res = await $request.invokeTemplate('sendEmail',{
        context:{},
        body:JSON.stringify(email)
    });
    console.log(`Verification Email sent to ${toEmail}`);
    return JSON.parse(res.response);

}

async function sendWebhookUrl(url,toEmail){

    var email = {
        "from":
        {
            "name":"Freshworks Support",
            "email":"support@freshworks.com"
        },
        "to":[
            {
                "name":"2FA App admin",
                "email":toEmail
            }
        ],

        "subject": "Webhook URL for 2FA custom app",
        "html":`<html><body>Hi team,<br><br>Please find the webhook URL linked below<br><br>${url}<br><br>Regards<br>Freshdesk Support</body></html>`,
        "accountId":2
    }

    var res = await $request.invokeTemplate('sendEmail',{
        context:{},
        body:JSON.stringify(email)
    });
    console.log(`Webhook email sent to ${toEmail}`);
    return JSON.parse(res.response);
}


async function sendNotification(performer,type,toEmail){

    var email = {
        "from":
        {
            "name":"Freshworks Support",
            "email":"support@freshworks.com"
        },
        "to":[
            {
                "name":"2FA App admin",
                "email":toEmail
            }
        ],
        "accountId":2
    }

    if(type == "encrypt"){
        console.log("Creating encrypt email");
        email.subject = `2FA-app notification: A password was encrypted by ${performer}`;
        email.html = `<html><body>Hi team,<br><br>A password was encrypted by user with the email ${performer}<br><br>Regards<br>Freshdesk Support</body></html>`;
    }
    else if(type == "decrypt"){
        console.log("Creating decrypt email");
        email.subject = `2FA-app notification: A password was decrypted by ${performer}`;
        email.html = `<html><body>Hi team,<br><br>A password was decrypted by user with the email ${performer}<br><br>Regards<br>Freshdesk Support</body></html>`;
    }
    else if(type == "newUser"){
        console.log("Creating new user registered email");
        email.subject = `2FA-app notification: A new user was registered for ${performer}`;
        email.html = `<html><body>Hi team,<br><br>A new user was registered for ${performer}<br><br>Regards<br>Freshdesk Support</body></html>`;
    }
    else if(type == "updatedUser"){
        console.log("Creating user updated email");
        email.subject = `2FA-app notification: A new user secret was registered for ${performer}`;
        email.html = `<html><body>Hi team,<br><br>A secret was updated for user with email ${performer}<br><br>Regards<br>Freshdesk Support</body></html>`;
    }

    var res = await $request.invokeTemplate('sendEmail',{
        context:{},
        body:JSON.stringify(email)
    });
    console.log(`Notification email sent to ${toEmail}`);
    return JSON.parse(res.response);

}

function validateEmail(email){
    return email.includes("@freshworks.com");
}
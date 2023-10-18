const firebase = require('firebase/app')

const firebaseConfig = {
    apiKey: "AIzaSyC6tNjJcOUxYuv5Vi4Sdv65k2mtdISX74w",
    authDomain: "papertrader-6c2df.firebaseapp.com",
    projectId: "papertrader-6c2df",
    storageBucket: "papertrader-6c2df.appspot.com",
    messagingSenderId: "347925682525",
    appId: "1:347925682525:web:f97b50c04a74c4bf3f30b4",
    measurementId: "G-S4YMV4SWVB"
  };

const firebaseApp = firebase.initializeApp(firebaseConfig);

module.exports = {firebaseApp}
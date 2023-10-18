const {initializeApp, cert} = require('firebase-admin/app')
const {getFirestore} = require('firebase-admin/firestore')
const {getAuth} = require('firebase-admin/auth')
const serviceAccount = require('./cred.json')

initializeApp({
    credential: cert(serviceAccount)
})

const dbAdmin = getFirestore()
const authAdmin = getAuth();

module.exports = {dbAdmin, authAdmin}
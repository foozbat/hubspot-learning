require('dotenv').config();
const express = require('express');
const querystring = require('querystring');
const axios = require('axios');
const session = require('express-session');
const NodeCache = require('node-cache');

const app = express();

const accessTokenCache = new NodeCache();

app.set('view engine', 'pug');

const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;

const REDIRECT_URI = `http://localhost:3000/oauth-callback`;

const authUrl = `https://app-na2.hubspot.com/oauth/authorize?client_id=${CLIENT_ID}&redirect_uri=http://localhost:3000/oauth-callback&scope=crm.objects.contacts.write%20oauth%20crm.objects.contacts.read`;

const refreshTokenStore = {};

app.use(session({
    secret: Math.random().toString(36).substring(2),
    resave: false,
    saveUninitialized: true
}));

const isAuthenticated = (userId) => {
    return refreshTokenStore[userId] ? true : false;
}

const getToken = async (userId) => {
    if (accessTokenCache.get(userId)) {
        console.log(accessTokenCache.get(userId));
        return accessTokenCache.get(userId);
    } else {
        try {
            const refreshTokenProof = {
                grant_type: 'refresh_token',
                client_id: CLIENT_ID,
                client_secret: CLIENT_SECRET,
                redirect_uri: REDIRECT_URI,
                refresh_token: refreshTokenStore[userId]
            };

            const response = await axios.post('https://api.hubapi.com/oauth/v1/token', querystring.stringify(refreshTokenProof));
            refreshTokenStore[userId] = response.data.refresh_token;
            accessTokenCache.set(userId, response.data.access_token, Math.round(response.data.expires_in * 0.75));
            return response.data.access_token;
        } catch (error) {
            console.error(error);
        }
    }
}

// * 1. Send user to authorization page. This kicks off initial requeset to OAuth server.
app.get('/', async (req, res) => {
    if (isAuthenticated(req.sessionID)) {
        const accessToken = await getToken(req.sessionID);
        const headers = {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
        };

        const contacts = 'https://api.hubapi.com/crm/v3/objects/contacts';

        try {
            const response = await axios.get(contacts, { headers });
            const data = response.data;
            res.render('home', {
                token: accessToken,
                contacts: data.results
            });
        } catch (error) {
            console.error(error);
        }
    } else {
        res.render('home', { authUrl });
    }
});

// * 2. Get temporary authorization code from OAuth server.
// * 3. Combine temporary auth code wtih app credentials and send back to OAuth server.
app.get('/oauth-callback', async (req, res) => {
    const authCodeProof = {
        grant_type: 'authorization_code',
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
        code: req.query.code
    };

    try {
        const response = await axios.post('https://api.hubapi.com/oauth/v1/token', querystring.stringify(authCodeProof));
        
        // * 4. Get access and refresh tokens.
        refreshTokenStore[req.sessionID] = response.data.refresh_token;
        accessTokenCache.set(req.sessionID, response.data.access_token, Math.round(response.data.expires_in * 0.75));
        res.redirect('/');
    } catch (error) {
        console.error(error);
    }
});



app.listen(3000, () => console.log('App running here: http://localhost:3000'));


const express = require('express');
const bodyParser = require('body-parser');
const Alpaca = require('@alpacahq/alpaca-trade-api')


const app = express();
app.use(bodyParser.json());
const port = process.env.PORT || 3000; 


const {firebaseApp} = require("./firebase.js");
const firebaseAuth = require('firebase/auth');
const firestore = require('firebase/firestore');

const auth = firebaseAuth.getAuth(firebaseApp);
const db = firestore.getFirestore(firebaseApp);

const {dbAdmin, authAdmin} = require('./firebaseAdmin.js')

const options = {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  timeZoneName: 'short',
  timeZone: 'UTC',
};

app.get('/', (req, res) => {
  res.send('Hello World!');
});


app.post('/auth/signup', async (req, res) => {
  try {
    const {email, password} = req.body

    const userRecord = await authAdmin.createUser({
      email,
      password,
    });

    let userRef = dbAdmin.collection('User').doc(userRecord.uid)
    await userRef.create({
      userId: userRecord.uid,
      setup: false
    })

    res.status(200).json(userRecord.uid);
    
  } catch (error) {
    res.status(500).json({error: 'Unable to create user'})
  }
})

app.get('/auth/signin', async (req, res) => {
  try {
    const {email, password} = req.body;
    const user = await firebaseAuth.signInWithEmailAndPassword(auth, email, password)
    res.status(200).json(user.user.uid)
  } catch (error) {
    console.error('Error signing in user:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
});

app.post('/setup/initialsetup', async(req, res) => {
  try {
    const {userId, username, age} = req.body
    let userRef = dbAdmin.collection('User').doc(userId)

    await userRef.set({
      userId: userId,
      username: username,
      age: age,
      setup: true
    })

    res.status(200).json({
      success: true
    })
  } catch (error) {
    console.error('Error signing in user:', error);
    res.status(500).json({
      error: 'Authentication failed',
      success: false
    });
  }
})

app.post('/accounts/create', async(req, res) => {
  try {
    const {userId, accountName, alpacaKey, alpacaSecretKey, startingBalance} = req.body
    let paperAccountRef = dbAdmin.collection("PaperAccount").doc(userId+"_"+accountName)

    await paperAccountRef.create({
      userId: userId,
      accountName: accountName,
      alpacaKey: alpacaKey,
      alpacaSecretKey: alpacaSecretKey,
      profit: 0
    })

    res.status(200).json({
      success: true
    })
  } catch (error) {
    console.error('Paper account creation failed', error);
    res.status(500).json({
      error: 'Paper account creation failed',
      success: false
    });
  }
})

app.get('/accounts/get', async(req, res) => {
  try {
    const {userId} = req.query;
    let paperCollectionRef = dbAdmin.collection("PaperAccount");

    let result = []
    await paperCollectionRef.where('userId', '==', userId).get().then((querySnapshot) => {
      querySnapshot.forEach((doc) => {
        console.log(doc.data())
        result.push(doc.data())
      })
      res.status(200).json({
        success: true,
        paperAccounts: result
      })
    })
  } catch (error) {
    console.error('Failed to get paper accounts', error);
    res.status(500).json({
      error: 'Failed to get paper accounts',
      success: false
    });
  }
})

app.get('/account/portfolioHistory', async(req, res) => {
  try {
    const {userId, accountName} = req.body


    let paperAccountRef = dbAdmin.collection("PaperAccount").doc(userId+"_"+accountName);
    let publicKey = null
    let privateKey = null

    await paperAccountRef.get().then((doc) => {
      if (doc.exists) {
        console.log(doc.data())
        publicKey = doc.data().alpacaKey
        privateKey = doc.data().alpacaSecretKey
      } else {
        console.log("Error when retrieving paper account")
      }
    }).catch((error) => {
      console.error("Error getting document", error)
    })
    
    const options = {
      keyId: publicKey,
      secretKey: privateKey,
      paper: true
    }

    const alpaca = new Alpaca(options)

    const currentDate = new Date(); // Get the current date
    currentDate.setFullYear(currentDate.getFullYear() - 1); // Subtract one year
    
    // Format the date as "YYYY-MM-DD"
    const yearAgoDate = currentDate.toISOString().slice(0, 10);

    const portfolioHistory = await alpaca.getPortfolioHistory({
      date_start: yearAgoDate,
      period: 'intraday',
      timeframe: '5Min'
      
    });


    res.status(200).json({
      success: true,
      timestamp: portfolioHistory.timestamp,
      equity: portfolioHistory.equity
    })

  } catch (error) {
    console.error('Failed to get portfolio history', error);
    res.status(500).json({
      error: 'Failed to get portfolio history',
      success: false
    })
  }
})

app.post('/stock/buy', async(req, res) => {
  try {
    const {userId, accountName, stockSymbol, quantity} = req.body;
    let paperAccountRef = dbAdmin.collection("PaperAccount").doc(userId+"_"+accountName);
  
    let publicKey = null
    let privateKey = null

    await paperAccountRef.get().then((doc) => {
      if (doc.exists) {
        console.log(doc.data())
        publicKey = doc.data().alpacaKey
        privateKey = doc.data().alpacaSecretKey
      } else {
        console.log("Error when retrieving paper account")
      }
    }).catch((error) => {
      console.error("Error getting document", error)
    })


    const options = {
      keyId: publicKey,
      secretKey: privateKey,
      paper: true
    }

    const alpaca = new Alpaca(options)

    await alpaca.createOrder({
      symbol: stockSymbol,
      qty: quantity,
      side: 'buy',
      type: 'market',
      time_in_force: "day",
    })

    res.status(200).json({
      success: true
    })

  } catch (error) {
    console.error('Failed to buy stock', error);
    res.status(500).json({
      error: 'Failed to buy stock',
      success: false
    })
  }
})

app.post('/stock/sell', async(req, res) => {
  try {
    const {userId, accountName, stockSymbol, quantity} = req.body;
    let paperAccountRef = dbAdmin.collection("PaperAccount").doc(userId+"_"+accountName);
  
    let publicKey = null
    let privateKey = null

    await paperAccountRef.get().then((doc) => {
      if (doc.exists) {
        console.log(doc.data())
        publicKey = doc.data().alpacaKey
        privateKey = doc.data().alpacaSecretKey
      } else {
        console.log("Error when retrieving paper account")
      }
    }).catch((error) => {
      console.error("Error getting document", error)
    })

    console.log(publicKey)
    console.log(privateKey)
    const options = {
      keyId: publicKey,
      secretKey: privateKey,
      paper: true
    }

    const alpaca = new Alpaca(options)

    await alpaca.createOrder({
      symbol: stockSymbol,
      qty: quantity,
      side: 'sell',
      type: 'market',
      time_in_force: "day",
    })

    res.status(200).json({
      success: true
    })

  } catch(error) {
    console.error('Failed to sell stock ' + error);
    res.status(500).json({
      error: 'Failed to sell stock',
      success: false
    })
  }
})

app.post('/social/post', async(req, res) => {
  try {
    const {userId, stockSymbol, content} = req.body
    const postId = Date.now().toString();
    let username = null;
    const userRef = dbAdmin.collection('User').doc(userId);

    await userRef.get().then((doc) => {
      if (doc.exists) {
        username = doc.data().username
      } else {
        console.log("User does not exist")
      }
    }).catch((error) => {
      console.log("Error getting user document " + error)
    })

    const postRef = dbAdmin.collection("Posts").doc(postId);

    const date = getTimeSeconds()

    await postRef.create({
      postId: postId,
      stockSymbol: stockSymbol,
      userId: userId,
      username: username,
      content: content,
      timestamp: date
    })

    res.status(200).json({
      success: true,
      message: "Successfully created post",
      postId: postId,
      content: content,
      username: username,
      formattedDate: date
    })

  } catch (error) {
    console.error("Error when posting " + error)
    res.status(500).json({
      success: false,
      message: "Error when creating post"
    })
  }
})


app.post('/social/comment', async(req, res) => {
  try {
    const {postId, userId, content} = req.body;

    let username = null;
    const userRef = dbAdmin.collection('User').doc(userId);

    await userRef.get().then((doc) => {
      if (doc.exists) {
        username = doc.data().username
      } else {
        console.log("User does not exist")
      }
    }).catch((error) => {
      console.log("Error getting user document " + error)
    })
    const commentId = Date.now().toString()
    const commentRef = dbAdmin.collection("Posts").doc(postId).collection("Comments").doc(commentId)

    const date = new Date();
    const formattedDate = date.toLocaleString('en-US', options);

    await commentRef.create({
      commentId: commentId,
      userId: userId,
      username: username,
      content: content,
      timestamp: formattedDate
    })

    res.status(200).json({
      success: true,
      message: "Successfully created comment",
      postId: postId,
      commentId: commentId,
      content: content,
      username: username,
      formattedDate: formattedDate
    })
  } catch (error) {
    console.log("Error when creating comment " + error)
    res.status(500).json({
      success: false,
      message: "Error when creating comment"
    })
  }
})

app.post('/social/rating', async(req, res) => {
  try {
    const {userId, postId, upvote} = req.body;

    const ratingRef = dbAdmin.collection("Posts").doc(postId).collection("Ratings").doc(userId)

    await ratingRef.create({
      userId: userId,
      upvote: upvote
    })

    res.status(200).json({
      success: true,
      message: "Successfully created rating"
    })

  } catch (error) {
    console.log("Error when creating rating " + error);
    res.status(500).json({
      success: false,
      messsage: "Error creating rating"
    })
  }
})

app.get('/social/getPosts', async(req, res) => {
  try {
    const {stockSymbol} = req.body;
    const postRef = dbAdmin.collection("Posts")

    const posts = []
    await postRef.where('stockSymbol', '==', stockSymbol).get().then((querySnapshot) => {
      querySnapshot.forEach((doc) => {
        posts.push(doc.data())
      })
    })
    for (const post in posts) {
      const commentsRef = postRef.doc(posts[post].postId).collection("Comments");
      const comments = []
      await commentsRef.get().then((querySnapshot) => {
        querySnapshot.forEach((doc) => {
          comments.push(doc.data())
        })
      })
      posts[post].comments = comments

      const ratingRef = postRef.doc(posts[post].postId).collection("Ratings")
      const ratings = []

      await ratingRef.get().then((querySnapshot) => {
        querySnapshot.forEach((doc) => {
          ratings.push(doc.data())
        })
      })
      console.log(ratings)
      const upvotes = []
      const downvotes = []

      for (const rating in ratings) {
        if (ratings[rating].upvote) {
          upvotes.push(ratings[rating].userId)
        } else {
          downvotes.push(ratings[rating].userId)
        }
      }
      posts[post].upvotingUsers = upvotes
      posts[post].upvoteCount = upvotes.length

      posts[post].downvotingUsers = downvotes
      posts[post].downvoteCount = downvotes.length
    }
    console.log("Posts:")
    console.log(posts)

    res.status(200).json({
      success: true,
      posts: posts
    })

  } catch (error) {
    console.error("Error getting posts for stock: " + error);
    res.status(500).json({
      success: false,
      message: "Error getting posts for stock"
    })
  }
})

app.get("/stock/history", async(req, res) => {
  try {
    const {userId, accountName, stockSymbol} = req.query

    let paperAccountRef = dbAdmin.collection("PaperAccount").doc(userId+"_"+accountName);
  
    let publicKey = null
    let privateKey = null

    await paperAccountRef.get().then((doc) => {
      if (doc.exists) {
        publicKey = doc.data().alpacaKey
        privateKey = doc.data().alpacaSecretKey
      } else {
        console.log("Error when retrieving paper account")
      }
    }).catch((error) => {
      console.error("Error getting document", error)
    })

    const options = {
      keyId: publicKey,
      secretKey: privateKey,
      paper: true
    }

    const alpaca = new Alpaca(options)
    
    const yearAgo = new Date();
    yearAgo.setFullYear(yearAgo.getFullYear() - 1);
    
    const yearAgoDate = yearAgo.toISOString().slice(0, 10);

    const currentDate = new Date();

    // Subtract one day
    currentDate.setDate(currentDate.getDate() -1);
    currentDate.setMinutes(currentDate.getMinutes()-60);

    console.log(currentDate)
    // Format the date as 'YYYY-MM-DD'
    const year = currentDate.getFullYear();
    const month = String(currentDate.getMonth() + 1).padStart(2, '0'); // Months are zero-based, so we add 1 and pad with '0'
    const day = String(currentDate.getDate()).padStart(2, '0');
    
    const formattedDate = `${year}-${month}-${day}`;

    const bars = alpaca.getBarsV2(stockSymbol, {
      start: yearAgoDate,
      end: formattedDate,
      timeframe: '1D'
    });
    const got = [];
    for await (let b of bars) {
      got.push(b);
    }
    const todayBar = await alpaca.getLatestBar(
      stockSymbol,
    )
    got.push(todayBar)
    res.status(200).json({
      success: true,
      bars: got
    })
  } catch (error) {
    console.error("Error loading stock page: " + error)
    res.status(500).json({
      success: false,
      message: "Error loading stock screen"
    })
  }
})

app.get('/stock/position', async(req, res) => {
  try {
    const {userId, accountName, stockSymbol} = req.body

    let paperAccountRef = dbAdmin.collection("PaperAccount").doc(userId+"_"+accountName);
  
    let publicKey = null
    let privateKey = null

    await paperAccountRef.get().then((doc) => {
      if (doc.exists) {
        publicKey = doc.data().alpacaKey
        privateKey = doc.data().alpacaSecretKey
      } else {
        console.log("Error when retrieving paper account")
      }
    }).catch((error) => {
      console.error("Error getting document", error)
    })

    const options = {
      keyId: publicKey,
      secretKey: privateKey,
      paper: true
    }

    const alpaca = new Alpaca(options)

    const stockPosition = await alpaca.getPosition(stockSymbol);
    console.log(stockPosition)
    
    res.status(200).json({
      success: true,
      position: stockPosition
    })
  } catch (error) {
    if (error == "Error: Request failed with status code 404") {
      res.status(200).json({
        success: true,
        position: {
          qty: '0'
        }
      })
    } else {
      console.error("Error getting stock position: " + error);
      res.status(500).json({
        success: false,
        message: "Error getting stock position"
      })
    }
  }
})
// Start the server
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

const getTimeSeconds = () => {
  return Math.round((new Date()).getTime() / 1000)
}
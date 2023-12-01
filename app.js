const express = require('express');
const bodyParser = require('body-parser');
const Alpaca = require('@alpacahq/alpaca-trade-api')
const fetch = require('node-fetch');
const assetMap = require('./assetMap.js')
const cors = require('cors')
const app = express();
app.use(bodyParser.json());
app.use(cors())
const port = process.env.PORT || 3000; 


const {firebaseApp} = require("./firebase.js");
const firebaseAuth = require('firebase/auth');
const firestore = require('firebase/firestore');

const auth = firebaseAuth.getAuth(firebaseApp);
const db = firestore.getFirestore(firebaseApp);

const {dbAdmin, authAdmin} = require('./firebaseAdmin.js');
const { post } = require('@alpacahq/alpaca-trade-api/dist/resources/order.js');

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
    console.log("Signing Up")
    const {email, password} = req.body
    console.log("Email: " + email)
    console.log("Password" + password)
    const userRecord = await authAdmin.createUser({
      email,
      password,
    });
    console.log("Created User")
    let userRef = dbAdmin.collection('User').doc(userRecord.uid)
    await userRef.create({
      userId: userRecord.uid,
      setup: false
    })
    console.log("Newly created userId: " + userRecord.uid)
    res.status(200).json(userRecord.uid);
    
  } catch (error) {
    res.status(500).json({error: 'Unable to create user'})
  }
})

app.get('/auth/signin', async (req, res) => {
  try {
    console.log("Signing In")

    const {email, password} = req.body;
    console.log("Email: " + email)
    console.log("Password" + password)

    const user = await firebaseAuth.signInWithEmailAndPassword(auth, email, password)
    console.log("Signed In userId: " + user.user.uid)

    res.status(200).json(user.user.uid)
  } catch (error) {
    console.error('Error signing in user:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
});

app.post('/setup/initialsetup', async(req, res) => {
  try {
    console.log("Doing initial setup")

    const {userId, username, age} = req.body
    console.log("UserId: " + userId)
    console.log("username: " + username)
    console.log("age: " + age.toString())

    let userRef = dbAdmin.collection('User').doc(userId)

    await userRef.set({
      userId: userId,
      username: username,
      age: age,
      reliability: 75,
      setup: true
    })

    console.log("Successfully created user")

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
    console.log("Creating paper account")
    const {userId, accountName, alpacaKey, alpacaSecretKey, startingBalance} = req.body

    console.log("userId: " + userId)
    console.log("accountName: " + accountName)
    console.log("alpacaKey: " + alpacaKey)
    console.log("alpacaSecretKey: ", alpacaSecretKey)

    let paperAccountRef = dbAdmin.collection("PaperAccount").doc(userId+"_"+accountName)

    await paperAccountRef.create({
      userId: userId,
      accountName: accountName,
      alpacaKey: alpacaKey,
      alpacaSecretKey: alpacaSecretKey,
      profit: 0
    })
    console.log("Successfully created paper account")

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
    console.log("Getting paper accounts")
    const {userId} = req.query;
    console.log("userId: " + userId)

    let paperCollectionRef = dbAdmin.collection("PaperAccount");

    let result = []
    await paperCollectionRef.where('userId', '==', userId).get().then((querySnapshot) => {
      querySnapshot.forEach((doc) => {
        result.push(doc.data())
      })
      console.log("Successfully got the following paper accounts: ")
      console.log(result)
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
    console.log("Retrieving portfolio history")

    const {userId, accountName} = req.query

    console.log("userId" + userId)
    console.log("accountName" + accountName)

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
    
    console.log("publicKey: " + publicKey)
    console.log("privateKey: " + privateKey)

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
    console.log("Retrieved the following portfolio history: ")
    console.log(portfolioHistory)

    res.status(200).json({
      success: true,
      timestamp: portfolioHistory.timestamp,
      equity: portfolioHistory.equity,
      profit_loss_pct: portfolioHistory.profit_loss_pct,
      profit_loss: portfolioHistory.profit_loss
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
    console.log("Buying stock")
    const {userId, accountName, stockSymbol, quantity} = req.body;

    console.log("userId: " + userId)
    console.log("accountName: " + accountName)
    console.log("stockSymbol: " + stockSymbol)
    console.log("quantity: " + quantity.toString())
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

    console.log("publicKey: " + publicKey)
    console.log("privateKey: " + privateKey)

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
    console.log("Successfully bought stock")
    res.status(200).json({
      success: true
    })

    const stockRef = dbAdmin.collection("Stock").doc(stockSymbol);
    
    stockRef.get()
    .then((doc) => {
      if (doc.exists) {
        console.log("Stock already exists")
        const stock = doc.data()
        const updatedStock = {
          quantity: stock.quantity + quantity
        }
        stockRef.update(updatedStock).then(() => {
          console.log("Successfully updated stock")
        })
        .catch((error) => {
          console.error("Error updating stock", error)
        })
      } else {
        console.log("Stock does not exist")
        const newStock = {
          symbol: stockSymbol,
          quantity: quantity
        }
        stockRef.set(newStock).then(() => {
          console.log("Successfully created stock")
        })
        .catch((error) => {
          console.error("Error updating stock", error)
        })
      }

    })
    .catch((error) => {
      console.log("Error getting document:", error);
    });

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
    console.log("Selling stock")
    const {userId, accountName, stockSymbol, quantity} = req.body;

    console.log("userId: " + userId)
    console.log("accountName: " + accountName)
    console.log("stockSymbol: " + stockSymbol)
    console.log("quantity: " + quantity.toString())

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

    console.log("publicKey: " + publicKey)
    console.log("privateKey: " + privateKey)

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

    console.log("Successfully sold stock")

    res.status(200).json({
      success: true
    })

    const stockRef = dbAdmin.collection("Stock").doc(stockSymbol);

    stockRef.get()
      .then((doc) => {
        if (doc.exists) {
          console.log("Stock already exists")
          const stock = doc.data()
          const updatedStock = {
            quantity: stock.quantity - quantity
          }
          stockRef.update(updatedStock).then(() => {
            console.log("Successfully updated stock")
          }).catch((error) => {
            console.error("Error updating stock", error)
          })
        } else {
          console.log("Stock does not exist")
          const newStock = {
            symbol: stockSymbol,
            quantity: quantity
          }
          stockRef.set(newStock).then(() => {
            console.log("Successfully created stock")
          })
          .catch((error) => {
            console.error("Error updating stock", error)
          })
        }
      })
      .catch((error) => {
        console.log("Error getting document:", error);
      });
    
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
    console.log("Creating a post")
    const {userId, stockSymbol, content} = req.body

    console.log("userId: " + userId)
    console.log("stockSymbol: " + stockSymbol)
    console.log("content: " + content)
    
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

    console.log("username: " + username)

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
    console.log("Successfully created post")

    res.status(200).json({
      success: true,
      message: "Successfully created post",
      postId: postId,
      content: content,
      username: username,
      formattedDate: date
    })

    var today = new Date();

    // Get the date components
    var dd = String(today.getDate()).padStart(2, '0');
    var mm = String(today.getMonth() + 1).padStart(2, '0'); // January is 0!
    var yyyy = today.getFullYear();

    // Concatenate the components with the desired format
    var formattedDate = mm + '-' + dd + '-' + yyyy;
    
    const postDataRef = dbAdmin.collection("PostData").doc(formattedDate);

    postDataRef.get()
      .then((doc) => {
        if (doc.exists) {
          console.log("Post data already exists")
          const postData = doc.data()
          const updatedPostData = {
            count: postData.count + 1
          }
          postDataRef.update(updatedPostData).then(() => {
            console.log("Successfully updated post data")
          }).catch((error) => {
            console.error("Error updating post data", error)
          })
        } else {
          console.log("Post data does not exist")
          const newPostData = {
            date: formattedDate,
            count: 1
          }
          postDataRef.set(newPostData).then(() => {
            console.log("Successfully created post data")
          })
          .catch((error) => {
            console.error("Error updating post data", error)
          })
        }
      })
      .catch((error) => {
        console.log("Error getting document:", error);
      });

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
    console.log("Creating commment")
    const {postId, userId, content} = req.body;

    console.log("postId:" + postId)
    console.log("userId: " + userId)
    console.log("content: " + content)

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

    console.log("username: " + username)

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
    console.log("Successfully created comment")

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
    console.log("Creating rating")
    const {userId, postId, upvote} = req.body;
    
    console.log("userId: " + userId)
    console.log("postId: " + postId)
    console.log("upvote: " + upvote)

    const ratingRef = dbAdmin.collection("Posts").doc(postId).collection("Ratings").doc(userId)


    let offset = 0

    await ratingRef.get()
    .then((docSnapshot) => {
      if (docSnapshot.exists) {
        const deletedData = docSnapshot.data();
        console.log('Data before deletion:', deletedData);
        offset = docSnapshot.data().upvote ? -2 : 5
        // Now, delete the document
        ratingRef.delete()
          .then(() => {
            console.log('Document successfully deleted.');
          })
          .catch((error) => {
            console.error('Error deleting document: ', error);
          });
      } else {
        console.log('No preexisting rating for this post and user');
      }
    })
    .catch((error) => {
      console.error('Error reading document: ', error);
    });

    console.log("Offset: ", offset)

    await ratingRef.create({
      userId: userId,
      upvote: upvote
    })

    console.log("Successfully created rating")

    const postRef = dbAdmin.collection("Posts").doc(postId)

    let postUserId = null
    await postRef.get().then((doc) => {
      postUserId = doc.data().userId
    })

    console.log("Post userId: ", postUserId)

    const userRef = dbAdmin.collection("User").doc(postUserId);

    let postUserReliability = null
    await userRef.get().then((doc) => {
      postUserReliability = doc.data().reliability;
    })

    console.log("Post user reliability is: ", postUserReliability);

    const updatedReliability = {
      reliability: upvote ? postUserReliability + 2 + offset : postUserReliability - 5 + offset
    }

    await userRef.update(updatedReliability).then(() => {
      console.log("Successfully updated reliability")
    })

    res.status(200).json({
      success: true,
      message: "Successfully created rating and updated user reliability"
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
    console.log("Getting social posts")

    const {stockSymbol} = req.body;
    console.log("stockSymbol: " + stockSymbol)

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
    console.log("Getting stock history")

    const {userId, accountName, stockSymbol, timeframe} = req.query
    console.log("userId: " + userId)
    console.log("accountName: " + accountName)
    console.log("stockSymbol: " + stockSymbol)

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

    console.log("publicKey: " + publicKey)
    console.log("privateKey: " + privateKey)

    const options = {
      keyId: publicKey,
      secretKey: privateKey,
      paper: true
    }

    const alpaca = new Alpaca(options)
    
    var startDate = new Date();
    if (timeframe == "Y") {
      startDate.setFullYear(startDate.getFullYear() - 1);
    } else if (timeframe == "M") {
      startDate.setMonth(startDate.getMonth() - 1);
    } else if (timeframe == "D") {
      // do nothing
    }
    
    startDate = startDate.toISOString().slice(0, 10);

    const bars = alpaca.getBarsV2(stockSymbol, {
      start: startDate,
      timeframe: timeframe == "D" ? alpaca.newTimeframe(30, alpaca.timeframeUnit.MIN) : alpaca.newTimeframe(1, alpaca.timeframeUnit.DAY)
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

app.get("/stock/get", async (req, res) => {
  try {
    console.log("Getting stock")

    const { userId, accountName, symbol } = req.query
    let paperAccountRef = dbAdmin.collection("PaperAccount").doc(userId + "_" + accountName);

    let publicKey = null
    let privateKey = null

    await paperAccountRef.get().then((doc) => {
      if (doc.exists) {
        publicKey = doc.data().alpacaKey
        privateKey = doc.data().alpacaSecretKey
      } else {
        console.log("Error when retrieving stock")
      }
    }).catch((error) => {
      console.error("Error getting document", error)
    })

    console.log("publicKey: " + publicKey)
    console.log("privateKey: " + privateKey)

    const options = {
      keyId: publicKey,
      secretKey: privateKey,
      paper: true
    }

    const alpaca = new Alpaca(options)
    asset = await alpaca.getAsset(symbol)
    console.log(asset)
    res.status(200).json({
      success: true,
      stock: asset
    })
  } catch (error) {
    console.error("Error getting stock: " + error)
    res.status(500).json({
      success: false,
      message: "Error getting stock"
    })
  }
})

app.get("/stock/snapshots", async (req, res) => {
  try {
    console.log("Getting stock snapshots")

    const { userId, accountName, symbols } = req.query
    let paperAccountRef = dbAdmin.collection("PaperAccount").doc(userId + "_" + accountName);

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

    console.log("publicKey: " + publicKey)
    console.log("privateKey: " + privateKey)

    const options = {
      keyId: publicKey,
      secretKey: privateKey,
      paper: true
    }

    const alpaca = new Alpaca(options)
    snapshots = await alpaca.getSnapshots(symbols.split(','))

    var stockList = []

    for (const snapshot of snapshots) {
      var stock = {
        symbol: snapshot.symbol,
        prevcloseprice: snapshot.PrevDailyBar.ClosePrice,
        closeprice: snapshot.DailyBar.ClosePrice,
        name: assetMap[snapshot.symbol]
      }
      stockList.push(stock)
    }
    console.log(stockList)
    res.status(200).json({
      success: true,
      snapshots: stockList
    })
  } catch (error) {
    console.error("Error getting snapshots: " + error)
    res.status(500).json({
      success: false,
      message: "Error getting snapshots"
    })
  }
})

app.get("/stock/company", async (req, res) => {
  try {
    console.log("Getting company name")

    const { symbols } = req.query
    const nameMap = {}
    for (const symbol of symbols.split(',')) {
      nameMap[symbol] = assetMap[symbol]
    }
    
    res.status(200).json({
      success: true,
      companies: nameMap
    })
  } catch (error) {
    console.error("Error getting company name " + error)
    res.status(500).json({
      success: false,
      message: "Error getting company name"
    })
  }
})

app.get('/stock/position', async(req, res) => {
  try {
    console.log("Getting stock position")
    const {userId, accountName, stockSymbol} = req.body
    console.log("userId: " + userId)
    console.log("accountName: " + accountName)
    console.log("stockSymbol: " + stockSymbol)
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

    console.log("publicKey: " + publicKey)
    console.log("privateKey: " + privateKey)

    const options = {
      keyId: publicKey,
      secretKey: privateKey,
      paper: true
    }

    const alpaca = new Alpaca(options)

    const stockPosition = await alpaca.getPosition(stockSymbol);
    console.log(stockPosition)
    console.log("Successfully retrieved stock position")
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

app.post('/account/closePositions', async(req, res) => {
  try {
    console.log("Getting stock position")
    const {userId, accountName} = req.body
    console.log("userId: " + userId)
    console.log("accountName: " + accountName)
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

    console.log("publicKey: " + publicKey)
    console.log("privateKey: " + privateKey)

    const positionsUrl = 'https://paper-api.alpaca.markets/v2/positions'; 

// Create the request headers
    const headers = {
      'APCA-API-KEY-ID': publicKey,
      'APCA-API-SECRET-KEY': privateKey,
    };

    // Fetch the open positions
    fetch(positionsUrl, {
      method: 'DELETE',
      headers,
    })

    res.status(200).json({
      success: true,
      message: "Successfully closed all positions"
    })
  } catch (error) {
    console.log("Error depositing into acccount", error)
    res.status(500).json({
      success: false,
      message: "Error closing positions"
    })
  }
})

app.get('/account/positions', async (req, res) => {
  try {
    console.log("Retrieving account positions")

    const { userId, accountName } = req.query

    console.log("userId" + userId)
    console.log("accountName" + accountName)

    let paperAccountRef = dbAdmin.collection("PaperAccount").doc(userId + "_" + accountName);
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

    console.log("publicKey: " + publicKey)
    console.log("privateKey: " + privateKey)

    const options = {
      keyId: publicKey,
      secretKey: privateKey,
      paper: true
    }

    const alpaca = new Alpaca(options)
    const positions = await alpaca.getPositions()
    console.log(positions)
    res.status(200).json({
      success: true,
      positions: positions
    })

  } catch (error) {
    console.log("Error retrieving positions: ", error)
    res.status(200).json({
      success: false,
      message: "Error retrieving positions"
    })
  }
})

app.get('/account/buyingPower', async(req, res) => {
  try {
    console.log("Retrieving account buying power")

    const {userId, accountName} = req.body

    console.log("userId" + userId)
    console.log("accountName" + accountName)

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
    
    console.log("publicKey: " + publicKey)
    console.log("privateKey: " + privateKey)

    const response = await fetch(`https://paper-api.alpaca.markets/v2/account`, {
      method: 'GET',
      headers: {
        'APCA-API-KEY-ID': publicKey,
        'APCA-API-SECRET-KEY': privateKey,
      },
    });
    let buyingPower = 0;
    if (response.ok) {
      const accountInfo = await response.json();
      buyingPower = accountInfo.buying_power;
      console.log('Buying Power:', buyingPower);
    } else {
      console.error('Error getting account information:', response.status, await response.text());
    }

    res.status(200).json({
      success: true,
      message: "Successfully got buying power",
      buyingPower: buyingPower
    })

  } catch (error) {
    console.log("Error retrieving buying power: ", error)
    res.status(200).json({
      success: false,
      message: "Error retrieving buying power"
    })
  }
})

app.get('/account/getAccount', async (req, res) => {
  try {
    console.log("Retrieving account info")

    const { userId, accountName } = req.query
    let paperAccountRef = dbAdmin.collection("PaperAccount").doc(userId + "_" + accountName);

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

    console.log("publicKey: " + publicKey)
    console.log("privateKey: " + privateKey)

    const options = {
      keyId: publicKey,
      secretKey: privateKey,
      paper: true
    }

    const alpaca = new Alpaca(options)
    account = await alpaca.getAccount()
    console.log(account)
    
    res.status(200).json({
      success: true,
      message: "Successfully got account",
      account: account
    })

  } catch (error) {
    console.log("Error retrieving account: ", error)
    res.status(200).json({
      success: false,
      message: "Error retrieving account"
    })
  }
})

app.get('/account/getOrders', async (req, res) => {
  try {
    console.log("Retrieving account orders")

    const { userId, accountName } = req.query
    let paperAccountRef = dbAdmin.collection("PaperAccount").doc(userId + "_" + accountName);

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

    console.log("publicKey: " + publicKey)
    console.log("privateKey: " + privateKey)

    const options = {
      keyId: publicKey,
      secretKey: privateKey,
      paper: true
    }

    const alpaca = new Alpaca(options)
    orders = await alpaca.getOrders({status: 'all', direction: 'desc'})
    console.log(orders)

    res.status(200).json({
      success: true,
      orders: orders
    })

  } catch (error) {
    console.log("Error retrieving orders: ", error)
    res.status(200).json({
      success: false,
      message: "Error retrieving orders"
    })
  }
})

app.post('/auth/admin', async(req, res) => {
  try {
    const {email, password} = req.body
    console.log("Email: ", email)
    console.log("Password: ", password)

    const user = await firebaseAuth.signInWithEmailAndPassword(auth, email, password)

    const userRef = dbAdmin.collection("User").doc(user.user.uid)
    let userDoc = {}
    await userRef.get()
      .then((doc) => {
        console.log("User document: ", doc.data())
        userDoc = doc.data()
      })
      .catch((error) => {
        console.error("Error retrieving admin document: ", error)
      })

    if (userDoc.admin) {
      res.status(200).json({
        "userId": user.user.uid,
        "user": userDoc
      })
    } else {
      console.log("Not an admin")
      res.status(403).json({})
    }


  } catch (error) {
    console.error("Error signing in: ", error)
    res.status(500)
  }
})

app.post('/auth/update', async(req, res) => {
  try {
    const {adminId, userId, newPassword} = req.body

    console.log("adminId: ", adminId)
    console.log("userId: ", userId)
    console.log("newPassword: ", newPassword)

    const adminRef = dbAdmin.collection("User").doc(adminId)
    let adminDoc = {}

    await adminRef.get()
      .then((doc) => {
        console.log("Admin document: ", doc.data())
        adminDoc = doc.data()
      })

      if (adminDoc.admin) {
        await authAdmin.updateUser(userId, {
          password: newPassword
        })
        .then((userRecord) => {
          console.log("Successfully updated user password: ", userRecord)
        })
        .catch((error) => {
          console.error("Error updating user password: ", error)
          throw error
        })
        res.status(200).json({
          success: true
        })
      } else {
        console.log("Not an admin")
        res.status(403).json({})
      }
  } catch (error) {
      console.error("Error updating user password: ", error)
      res.status(500).json({
    })
  }
})

app.post('/auth/updateUsername', async(req, res) => {
  try {
    const {adminId, userId, newUsername} = req.body

    console.log("AdminId: ", adminId)
    console.log("UserId: ", userId)
    console.log("New username: ", newUsername)

    const adminRef = dbAdmin.collection("User").doc(adminId)
    let adminDoc = {}

    await adminRef.get()
      .then((doc) => {
        console.log("Admin document: ", doc.data())
        adminDoc = doc.data()
      })

    if (adminDoc.admin) {
      const userRef = dbAdmin.collection("User").doc(userId)
      await userRef.update({
        username: newUsername
      })
      .then(() => {
        console.log("Successfully updated username")
      })
      .catch((error) => { 
        console.error("Error updating username: ", error)
        throw error
      })
      res.status(200).json({
        success: true
      })
    } else {
      console.log("Not an admin")
      res.status(403).json({})
    }
    
  } catch (error) {
    console.log("Error updating username: ", error)
    res.status(500).json({

    })
  }
})

// Start the server
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

const getTimeSeconds = () => {
  return Math.round((new Date()).getTime() / 1000)
}
/** APP **/
// Node app

// ROOT PATH
var path = require('path');
global.appRoot = path.resolve(__dirname);

// Initialize express
var express = require('express'),
	app = express();

var port = process.env.PORT || 8001;

// Libs
var database = require("./app/lib/database.js");
var twitterStream = require("./app/lib/twitterStream.js");
var track = require(global.appRoot + '/public/track.json');

// Models
var Tweet = require("./app/models/Tweet.js");

// Initialize a new socket.io object. It is bound to 
// the express app, which allows them to coexist.
var io = require('socket.io').listen(app.listen(port));

// Require the configuration and the routes files, and pass
// the app and io as arguments to the returned functions.
require('./config')(app, io);
require('./routes')(app, io);

// Logging
console.log('Your application is running on http://localhost:' + port);

// Vars
var numberTweets, mostHatedUser, mostHatedUsersLastTweet;

// When socket connection
io.on('connection', function (socket) {

	// Immediately send the number of tweets/retweets last minute
	socket.on('retrieve_number_tweets', function() {
		emitNumberTweets();
	});

	// Immediately send the last tweet
	socket.on('retrieve_last_tweet', function() {
		emitLastTweet();
	});

	// Immediately send the most hated user (and the first tweet)
	socket.on('retrieve_most_hated_user', function() {
		emitMostHatedUserAndTweet();
	});

});

// Twitter Stream
twitterStream.on('tweet', function (tweet) {

	try {

		// FILTER: If it's not a hate tweet, we ignore it
		if (!Tweet.isItAHateTweet(tweet)) return;

		// Dispatcher: Is it a retweet?
		if (Tweet.isItARetweet(tweet)) {
			console.log(' ');
			console.log(JSON.stringify(tweet));
			console.log(' ');
			database.saveRetweet(tweet);
		} else {

			// Or it is a tweet
			console.log(tweet.text);
			database.saveTweet(tweet);

			// Save the users
			var users = Tweet.getUsernamesInTweet(tweet);
			database.saveUsers(users);

			// Is it a tweet to be shown?
			if (Tweet.isItATweetToBeShown(tweet, track)) {
				io.sockets.emit('tweet', tweet.text);
			}

		}

		if (Tweet.isTweetForMostHatedUser(tweet, mostHatedUser)) {
			mostHatedUsersLastTweet = tweet.text;
			io.sockets.emit('most_hated_user_tweet', tweet.text);
		}

	} catch (err) {
		console.log(err);
	}

});

// EMIT DATA
// Last tweet
function emitLastTweet() {

	database.getLastTweetFromDatabase(function(tweet) {
		io.sockets.emit('tweet', tweet.tweet);
	});
}

// Number Tweets
function emitNumberTweets() {

	database.getNumberOfTweetsInLastMinute(function(number_tweets) {
		numberTweets = number_tweets;
		var data = { number_tweets: number_tweets };
		io.sockets.emit('number_tweets', data);
	});
}

// Most hated user
function emitMostHatedUser() {

	database.getMostHatedUser(function(user) {

		mostHatedUser = user.user;
		io.sockets.emit('most_hated_user', user);
	});
}

function emitMostHatedUserAndTweet() {

	database.getMostHatedUser(function(user) {

		if (user) {
			mostHatedUser = user.user;
			io.sockets.emit('most_hated_user', user);

			database.getMostHatedUsersLastTweet(mostHatedUser, function(tweet) {
				mostHatedUsersLastTweet = tweet.text;
				io.sockets.emit('most_hated_user_tweet', tweet);
			});
		}
	});
}

// Most hated user
function emitMostHatefulUser() {

	database.getMostHatefulUser(function(user) {

		mostHatedUser = user.user;
		io.sockets.emit('most_hateful_user', user);
	});
}

function emitMostHatefulUserAndTweet() {

	database.getMostHatefulUser(function(user) {

		mostHatedUser = user.user;
		io.sockets.emit('most_hateful_user', user);

		database.getMostHatefulUsersLastTweet(mostHatedUser, function(tweet) {
			mostHatedUsersLastTweet = tweet.text;
			io.sockets.emit('most_hateful_user_tweet', tweet);
		})
	});
}


// FREQUENT UPDATES
// Number Tweets
var frequencyOfUpdateNumberTweets = 500;
setInterval(function() {

	emitNumberTweets();

}, frequencyOfUpdateNumberTweets);

// Most Hated User
var frequencyMostHatedUser = 10000;
setInterval(function() {
	emitMostHatedUser();
}, frequencyMostHatedUser);

// Save historic data
var frequencyOfHistoricData = 60000; // 1 minute in miliseconds

var mostHatedUsersLastTweetId, mostHatedUsersLastTweetUser;

setInterval(function() {

	database.getMostHatedUser(function(user) {

		mostHatedUser = user.user;

		// We need to get first the most hated user's last tweet
		database.getMostHatedUsersLastTweet(mostHatedUser, function(tweet) {
			mostHatedUsersLastTweet = tweet.tweet;
			mostHatedUsersLastTweetId = tweet.id_str;
			mostHatedUsersLastTweetUser = tweet.screen_name;

			database.getMostHatedUserNumberTweets(mostHatedUser, function(numTweets) {
				database.saveHistoricData(numberTweets, mostHatedUser, numTweets, mostHatedUsersLastTweet, mostHatedUsersLastTweetId, mostHatedUsersLastTweetUser);
			});

		})
	});

}, frequencyOfHistoricData);


// Clean old data: tweets, retweets and users
var frequencyOfCleaningTweets = 60000; // 1 minute in miliseconds
var timeBeforeTweetsAreCleaned = 10; // 10 minutes
setInterval(function() {

	database.cleanOldData(timeBeforeTweetsAreCleaned);

}, frequencyOfCleaningTweets);

database.cleanOldData(timeBeforeTweetsAreCleaned);
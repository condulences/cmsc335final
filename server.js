const path = require("path");
const express = require("express"); /* Accessing express module */
const app = express(); /* app is a request handler function */
const bodyParser = require("body-parser"); /* To handle post parameters */
app.set("views", path.resolve(__dirname, "templates"));
app.set("view engine", "ejs");
app.use(bodyParser.urlencoded({ extended: false }));
app.use(express.static(__dirname));

// Set up MongoDB
// TODO - fill in your own connection string in .env
require("dotenv").config({ path: path.resolve(__dirname, ".env") });
const dbName = process.env.MONGO_DB_NAME;
const dbCollection = process.env.MONGO_COLLECTION;
const databaseAndCollectionName = { db: process.env.MONGO_DB_NAME, collection: process.env.MONGO_COLLECTION_1 };
const databaseAndCollectionPopularity = {db: process.env.MONGO_DB_NAME, collection:process.env.MONGO_COLLECTION_2};
const { MongoClient, ServerApiVersion } = require("mongodb");
const uri = `mongodb+srv://${process.env.MONGO_DB_USERNAME}:${process.env.MONGO_DB_PASSWORD}@cluster0.zyg3lrs.mongodb.net/?retryWrites=true&w=majority`
const client = new MongoClient(uri, { serverApi: ServerApiVersion.v1 });

const APIKEY = process.env.X_RAPIDAPI_KEY;


process.stdin.setEncoding("utf8"); /* encoding */
const portNumber = process.env.PORT || 5000;

/* Set up "stop" command */
process.stdin.on("readable", async () => {
	/* on equivalent to addEventListener */
	const dataInput = process.stdin.read();
	if (dataInput !== null) {
		const command = dataInput.trim();
		if (command === "stop") {
			console.log("Shutting down the server");
			process.exit(0); /* exiting */
		} else {
			console.log(`Invalid command: ${command}`);
		}
	}
	process.stdin.resume();
});

app.get("/", async (request, response) => {
	// Get Quote from API
	const url = "https://quotes15.p.rapidapi.com/quotes/random/";
	const options = {
		method: "GET",
		headers: {
			"X-RapidAPI-Key": APIKEY,
			"X-RapidAPI-Host": "quotes15.p.rapidapi.com",
		},
	};

	let quote = "";
	let author = "";

	try {
		// Commented code block is the correct code to get info from the API. I will be writing in dummy info for a bit now
		
		const response = await fetch(url, options);
		const result = await response.json();
		quote = result.content;
		author = result.originator.name;
		/*
		quote = "This class is sponsored by Starbucks (TM)"
		author = "Nelson Padua-Perez"
		*/
	} catch (error) {
		console.error(error);
	}

	response.render("index", { quote, author });
});

app.post("/processQuote", async (request, response) => {
	const { quote, author, name, action } = request.body;
	try {
		await client.connect();

		// Add the quote as a likedQuote of the person who liked it
		let nameFilter = {"name": name};
		let nameResult = await client.db(databaseAndCollectionName.db)
						.collection(databaseAndCollectionName.collection)
						.findOne(nameFilter);

		if (!nameResult) {
			// Defines a new person for the entry
			nameResult = {
				"name" : name,
				"likedQuotes" : [],
			};
			// Inserts the new person into the database
			await client.db(databaseAndCollectionName.db).collection(databaseAndCollectionName.collection).insertOne(nameResult);
		}
		// Updates the entry for likedQuotes in the DB
		await client.db(databaseAndCollectionName.db).collection(databaseAndCollectionName.collection).updateOne(
			{"name": name},
			{$addToSet: {"likedQuotes": {"quote": quote, "author": author}}}
		);

		// Then increment the count on the quote (if it exists in the database)
		let quoteFilter = {"quote": quote};
		let quoteResult = await client.db(databaseAndCollectionPopularity.db)
						.collection(databaseAndCollectionPopularity.collection)
						.findOne(quoteFilter);

		if (!quoteResult) {
			quoteResult = {
				"quote" : quote,
				"author" : author,
				"popularity" : 1,
			}
			// Inserts the new quote into the database
			await client.db(databaseAndCollectionPopularity.db).collection(databaseAndCollectionPopularity.collection).insertOne(quoteResult);
		} else {
			// Update the popularity to be + 1
			await client.db(databaseAndCollectionPopularity.db).collection(databaseAndCollectionPopularity.collection).updateOne(
				{"quote" : quote},
				{$set: {"popularity": quoteResult.popularity + 1}}
			);
		}
    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
	
	response.render("processQuote.ejs", {
		message: `Thanks ${name}! Your ${action} on "${quote}" by ${author} has been recorded.`,
	});
});

app.get("/bestQuotes", async (request, response) => {
	let table = ""

	try {
        await client.connect();
		cursor = client.db(databaseAndCollectionPopularity.db)
					.collection(databaseAndCollectionPopularity.collection)
					.find().sort({popularity:-1}).limit(10);

		
		await cursor.forEach(({quote, author, popularity}) => {
			table += `With ${popularity} Popularity, <br> ${quote} <br> -${author}<hr class="short" />`;
		});

		if (table === "") {
			table = "Sorry! It looks like you haven't ranked any quotes.";
		}
    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }

	response.render("bestQuotes.ejs", {"table": table});
});

app.get("/bestQuotesByName", (request, response) => {
	response.render("bestQuotesByName");
});

app.post("/processBestQuotesByName", async (request, response) => {
	let { name } = request.body;
	let table = "";

	try {
        await client.connect();
        let filter = {"name": name};
		result = await client.db(databaseAndCollectionName.db)
						.collection(databaseAndCollectionName.collection)
						.findOne(filter);


		if (!result) {
			table = "Sorry! You haven't submitted any quotes yet";
		} else { 
			for ({quote, author} of result.likedQuotes) {
				table += `${quote} <br> -${author}`;
				table += "<hr>";
			}
		}
    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }

	response.render("processBestQuotesByName.ejs", {name:name, table:table});
});

app.listen(portNumber, () => {
	console.log(
		`Web server started and running at http://localhost:${portNumber}`
	);
	console.log("Stop to shutdown the server");
});

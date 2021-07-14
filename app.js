/*
Note, the the returns from the functions below
are what is being sent back through the response
stream, we use this as a middleman between our
mongodb and our front end hence all communicaiton
is done via requests and responses from the front
end to the back end
*/

const express = require('express');
const bodyParser = require('body-parser');
const mergeImages = require('merge-images');
const { Canvas, Image } = require('canvas');

const app = express();
app.use(express.json({
	inflate: true,
	limit: '500kb',
	reviver: null,
	strict: true,
	type: 'application/json',
	verify: undefined
}));

app.use(express.urlencoded({extended: false}));

// Must match up with /etc/nginx/frameworks-available/nodejs.conf!
const port = 8081;

// Required for running behind ngx
app.set('trust proxy', 'loopback');

var MongoClient = require('mongodb').MongoClient;
var url = "mongodb://localhost:27017/login";

/*
Adds a student to the database

Params:
	res 		: file stream 	: response stream
	name 		: string 		: user name
	email 		: string 		: user email 
	password 	: string 		: user password
	type 		: string 		: user type, teacher or student
	school 		: string 		: which school the user is with
	classnum 	: array 		: all classes this user is in

Returns: string : wether the email is already in use or the registration has been complete
*/

function insertStudent(res, name, email, password, type, school, classnum){
	MongoClient.connect(url, function(err, db) {
	var dbo = db.db("login");
	dbo.collection("details").find({}, {'id':1}).limit(1).sort({$natural:-1}).toArray(function(err, result){
		retrievedID = result[0].id;
		retrievedID++;
		var classnums = classnum.split(',');
		for(i = 0; i < classnums.length; i++){
			classnums[i] = Number(classnums[i]);
		}
		console.log(classnums);
		console.log(retrievedID);
		retrievedEmail = result[0].email;
		console.log("retrieved email :" + retrievedEmail + "  email :" + email);
		if(retrievedEmail != email){
			dbo.collection('details').insertOne(
				{
					id:retrievedID,
					name:name,
					email:email,
					password:password,
					type:type,
					school:school,
					class:classnums
				}
			);
		}
		else{
			res.send('email already registered');
			return;
		}

		res.send("completed registration");
	});
	
});
}

/*
Logs a user in

Params:
	res 		: file stream : response stream
	email 		: string 	  : users email
	password 	: string 	  : users password

Returns: 
	string : when either email or password is incorrect
	object : relevant user data when details are correct, including id, name, class, shool, type
*/

function login(res, email, password) {
	MongoClient.connect(url, function(err, db) {
		var dbo = db.db('login');
		dbo.collection('details').find({email: email}).toArray(function(err,result) {	
			console.log(result);
			if(result.length == 0) {
				res.send('user doesnt exist');
				return
			}
			var userDetails = {"id":result[0].id, "name":result[0].name, "class":result[0].class, "school":result[0].school, "type":result[0].type};
			console.log(userDetails);
			if(result[0].password === password) {
				res.send(userDetails);
			} else {
				res.send('incorrect password');
			}
		});
		db.close();
	});
}

/*
Adds a theme to a book

Params:
	dbo    : object      : connetion to the database
	res    : file stream : response stream
	bookId : string      : book id number
	pageId : string      : page id number
	theme  : string      : the description of the theme
*/

async function addTheme(dbo, res, bookId, pageId, theme){
	numPageId = Number(pageId);
	numBookId = Number(bookId);
	var qry = {bookId: numBookId};
	var flag = false;
	var book = await dbo.collection('book').findOne(qry);
	for(i = 0; i < book.pages.length; i++){
		if(book.pages[i].pagenum == numPageId){
			book.pages[i].theme = theme;
			res.send("added theme to page");
			flag = true;
		}
	}
	if(flag == false){
		res.send("page not found");
	}
	dbo.collection('book').replaceOne({bookId:numBookId}, book);
}

/*
Adds a book to the database

Params:
	bookTitle 		: string 	 : the name of the book
	bookCoverLink 	: string 	 : deprecated, previously planned to be a path may now be a base64 png string
	school 			: string 	 : the school of the users who wrote the book
	classID 		: string 	 : which class is writing this book
	res 			: fileStream : repsonse stream

Returns:
	string : the books ID number in the database
*/

function addBook(bookTitle, bookCoverLink, school, classID, res) {
	MongoClient.connect(url, function(err, db) {
		var dbo = db.db('books');
		var intClassId = Number(classID);
		var finalimg = "";
		var page = {theme : "", pagenum : 0, active: "true", creators:[], finalImage:finalimg};
		var arr = [page];
		dbo.collection('book').find({}, {'bookId':1}).limit(1).sort({$natural:-1}).toArray(function(err, result) {
			var nextID = result[0].bookId;
			nextID++;
			console.log(nextID);
			console.log(result);
			dbo.collection('book').insertOne({
				bookId:nextID,
				bookTitle:bookTitle,
				bookCoverLink:bookCoverLink,
				school:school,
				classID:intClassId,
				pages:arr
			});
			res.send(String(nextID));
		});
	});
}

/*
Adds a page to a book

Params:
	ID 	: string      : ID of book to add a page to
	dbo : object      : connetion to the database
	res : file stream : response stream

Returns:
	int : the page ID of the new page
*/

async function addPage2(ID,  dbo, res){
	console.log("===========================================================");
	console.log("addPage2:");
	var numId = Number(ID);
	console.log("here is ree :" + numId);
	var qry = {bookId: numId};
	var book = await dbo.collection('book').findOne(qry);
	console.log("book : " + book);
	if(book.pages.length == 0) {
		var newpage = 1;
	} else {
		console.log("AAAA " + book.pages);
		var newpage = Number(book.pages[book.pages.length-1].pagenum);
		newpage += 1;
	}
	if(newpage == null) {
		newpage = 1;
	}
	var finalimg = "";
	console.log("new page " + newpage), res;
	var page = {pagenum : newpage, active: "true", creators:[], finalImage:finalimg};
	var vals = {$addToSet:{pages:page}};
	console.log(page);
	await dbo.collection('book').updateOne(qry, vals);
	res.send(String(newpage));
}

/*
Adds multiple pages to a book

Params:
	dbo    : object : database connection
	bookId : string : book number
	num    : string : amount of pages to be added
	res    : string : response stream

Returns:
	string : added creator to page
*/

async function addPages(dbo, bookId, num, res) {
    console.log("===========================================================");
    console.log("addPages:");
    var numBook = Number(bookId);
    var numPages = Number(num);
    var query = {bookId: numBook};
    var book = await dbo.collection('book').findOne(query);
    if (book == null) {
       res.send("invalid");
    }
    console.log(book);
    console.log("found book:\n" + book);
    var pageCount = book.pages.length;
    console.log("adding " + numPages + " pages starting at page " + pageCount);
    var pages = book.pages;
    for (i = 0; i < numPages; i++) {
        var page = {theme: "", pagenum: pageCount, active: "true", creators: [], finalImage: ""};
        pages.push(page);
        pageCount++;
    }
    console.log(pages);
    book.pages = pages;
    console.log(book);
    dbo.collection('book').replaceOne({bookId: numBook}, book);
	res.send("Added " + numPages + " pages");
}

/*
Adds a creator to a page in a book

Params:
	bookId  : string : book number
	pageID 	: string : page number 
	dbo 	: object : database connection
	sID 	: string : student ID number
	role 	: string : students role, either background, text or character

Returns:
	string : added creator to page
*/

async function addCreator(bookID, pageID, dbo, sID, role, res) {
	console.log("===========================================================");
	console.log("addCreator:");
	var numID = Number(bookID);
	var numPage = Number(pageID);
	var numSID = Number(sID);
	console.log("bookID :" + numID + " pageNumber :" + numPage);
	var creatrs = {studentId:numSID, role:role, canvas:"", creatorFinal:""};
	console.log("creators "+creatrs);
	var imMad = await dbo.collection('book').findOne({bookId:numID});
	for(i = 0; i < imMad.pages.length; i++) {
		console.log("PAGES: " + imMad.pages);
		if(imMad.pages[i].pagenum  == numPage) {
			for(j = 0; j < imMad.pages[i].creators.length; j++) {
				if(imMad.pages[i].creators[j].studentId == numSID) {
					res.send("student is already a creator");
					return;
				}
			}
			imMad.pages[i].creators.push(creatrs);
		}
	}
	console.log("NOOOOO   " +imMad);
	dbo.collection('book').replaceOne({bookId:numID}, imMad);
	res.send("added creator to page");
}

/*
Gets a students role from a page in a book

Params:
	dbo    : object      : databse connection
	bookId : string  	 : book id number
	pageId : string 	 : page id number
	sId    : string 	 : student id number
	res    : file stream : response stream

Returns:
	string : creators role
	none   : there is no user with this id on that page in that book
*/

async function getRole(dbo, bookId, pageId, sId, res) {
	console.log("===========================================================");
	console.log("getRole:");
	var numSid = Number(sId);
	var numBook = Number(bookId);
	var numPage = Number(pageId);
	console.log("bookdId " + numBook + " pageId " + numPage + " studentId " + numSid);
	var creators = await getCreator(dbo, bookId, pageId, null);
	for (cr = 0; cr < creators.length; cr++) {
		if (creators[cr].studentId == numSid) {
			console.log("Found student " + numSid + " in creators as role " + creators[cr].role);
			console.log("===========================================================");
			res.send(creators[cr].role);
			return;
		}
	}
	console.log("Didn't find student in list of creators");
	res.send("invalid");
}

/*
Checks if a canvas is empty

Params:
	creators : object : a creators object

Returns:
	boolean : wether the canvas is empty or not
*/

async function checkIfCanvasEmpty(creators) {
	console.log("===========================================================");
	console.log("checkIfCanvasEmpty");
	console.log(creators);
	for (cr = 0; cr < creators.length; cr++) {
		console.log("this canvas for student " + creators[cr].studentId + " has length: " + creators[cr].canvas.length);
		if (creators[cr].canvas.length == 0) {
			console.log("all canvases aren't ready for merge");
			return false;
		}
	}
	console.log("all canvases are ready for merge");
	return true;
}

/*
Adds an image to the creators of a page of a book

Params:
	dbo    : object      : databse connection
	bookId : string      : the books id number
	pageId : string      : the page id number
	sId    : string      : the string id number
	image  : string      : base 64 string of png image
	res    : file stream : response stream

Returns:
	string : true when successful
*/

async function addImageToCreator(dbo, bookId, pageId, sId, image, res) {
	console.log("===========================================================");
	console.log("addImageToCreator:");
	var numSid = Number(sId);
	var numBid = Number(bookId);
	var pageId = Number(pageId);
	console.log("bookId: " + numBid + " pageId: " + pageId + " StudentId: " + numSid);
	var book = await dbo.collection('book').findOne({bookId:numBid});
	var creators = await getCreator(dbo, bookId, pageId, null);
	console.log("Creators for this book and page are: " + creators);
	for (cr = 0; cr < creators.length; cr++) {
		console.log("Creators studentId: " + creators[cr].studentId);
		if (creators[cr].studentId == numSid) {
			console.log("Creator is given image: " + image.length);
			creators[cr].canvas = image;
			for (pg = 0; pg < book.pages.length; pg++) {
				if (book.pages[pg].pagenum == pageId) {
					console.log("replacing old list of creators");
					book.pages[pg].creators = creators;
					var replace = await  dbo.collection('book').replaceOne({bookId: numBid}, book);
					if(replace.modifiedCount == 1){
						console.log("success");
						var returnTxt = "true";
						return returnTxt;
					}
				}
			}
		}
	}
	console.log("failed");
}

/*
Gets an entire book object

Params:
	dbo    : object 		 : database connection
	bookId : string 		 : string
	res    : file stream     : response stream

Returns:
	object : book object
*/

async function getBook(dbo, bookId, res) {
	console.log("===========================================================");
	console.log("getBook:");
	var intBookId = Number(bookId);
	dbo.collection('book').find({bookId: intBookId}).toArray(function(err,result) {
		console.log(result[0]);
		res.send(result[0]);
	})
}

/*
Gets a page from a book

Params:
	dbo    : object 	 : database connection
	bookId : string 	 : book id number
	pageId : stirng 	 : page id number
	res    : file stream : response stream

Returns:
	object : page
*/

async function getPage(dbo, bookId, pageId, res) {
	console.log("===========================================================");
	console.log("getPage:");
	var intBookId = Number(bookId);
	var intPageId = Number(pageId);
	var book = await dbo.collection('book').findOne({bookId:intBookId});
	for(i = 0; i < book.pages.length; i++) {
		if(book.pages[i].pagenum == intPageId) {
			console.log(book.pages[i]);
			res.send(book.pages[i]);
		}
	}
}

/*
Gets a creator from a page

Params:
	dbo    : object 	 : database connection
	bookId : string 	 : book id number
	pageId : string 	 : page id number
	res    : file stream : response stream

Returns:
	object : creator object
*/

async function getCreator(dbo, bookId, pageId, res) {
	console.log("===========================================================");
	console.log("getCreator:");
	var intBookId = Number(bookId);
	var intPageId = Number(pageId);
	var book = await dbo.collection('book').findOne({bookId:intBookId});
	for(i = 0; i < book.pages.length; i++) {
		if(book.pages[i].pagenum == intPageId) {
            if (res == null) {
            	return book.pages[i].creators;                            
            }
            res.send(book.pages[i].creators);
        }
    }
}

/*
Gets all pages from a book

Params:
	dbo    : object 	 : database connection
	bookId : string 	 : book id number
	res    : file stream : response stream

Returns:
	array : array of pages
*/

async function getPages(dbo, bookId, res) {
	console.log("===========================================================");
	console.log("getPages:");
	var intBookId = Number(bookId);
	var book = await dbo.collection('book').findOne({bookId:intBookId});
	console.log(book.pages);
	res.send(book.pages);	
}

/*
Gets all books from a class at a school

Params:
	dbo        : object 	 : database connection
	classId    : string 	 : class id number
	schoolName : string 	 : school name
	res        : file stream : response stream

Returns:
	array<object> : contains all book objects from that class at that school
*/

async function getClassBooks(dbo, classId, schoolName, res) {
	console.log("===========================================================");
	console.log("getClassBooks:");
	var intClassId = Number(classId);
	var collection = [];
	dbo.collection('book').find({classID: intClassId}).toArray(function(err,result) {
		console.log(result);
		for(i = 0; i < result.length; i++) {
			if(result[i].school == schoolName) {
				collection.push(result[i]);
			}
		}
		res.send(collection);
		return result;
	})
}

/*
Gets all books from a school

Params:
	dbo    : object 	 : database connection
	school : string 	 : school name
	res    : file stream : response stream

Returns:
	object : creator object
*/

async function getSchoolBooks(dbo, school, res) {
	console.log("===========================================================");
	console.log("getSchoolBooks:");
	dbo.collection('book').find({school: school}).toArray(function(err,result) {
		console.log(result);
		res.send(result);
		return result;
	})
}

/*
Gets all students from a classnums

Params:
	dbo     : object 	  : database connection
	res     : file stream : response stream
	classId : string 	  : class Id number
	school  : string 	  : school name

Returns:
	array<array<int, string>> : an array of arrays containing student ID and student name
*/

async function getClassStudents(dbo, res, classId, school) {
	console.log("===========================================================");
	console.log("getClassStudents:");
	classNumber = Number(classId);
	dbo.collection('details').find().toArray(function(err,result) {
		classStudents = [];
		for(i=0; i<result.length; i++) {
			if(result[i].class.includes(classNumber) && result[i].school == school) {
				console.log('found one ' + result[i].name);
				classStudents.push([result[i].id, result[i].name]);
			}
		}
		res.send(classStudents);
	})
}

/*
Gets all schools from the database

Params:
	dbo    : object 	 : database connection
	res    : file stream : response stream

Returns:
	array<string> : an array of all school names
*/

async function getSchools(dbo, res) {
	console.log("===========================================================");
	console.log("getSchools:");
	var schools = [];
	dbo.collection('details').find().toArray(function(err, result) {
		for(i = 0; i < result.length; i++) {
			if(!schools.includes(result[i].school)){
				schools.push(result[i].school);
			}
		}
		console.log(schools);
		res.send(schools);
	})
}

/*
Deletes a page from a book

Params:
	dbo    : object 	 : database connection
	bookId : string 	 : book id number
	res    : file stream : response stream

Returns:
	string : upon completion confirms book no longer exists
*/

async function deleteBook(dbo, res, bookId) {
	var numBookId = Number(bookId);
	dbo.collection('book').deleteOne({bookId:numBookId});	
	res.send('book now not exist');
}

/*
Gets a users name from their ID

Params:
	dbo : object 	  : database connection
	res : file stream : response stream
	sId : string      : student id number

Returns:
	string : users name
*/

async function getName(dbo, res, sId) {
	console.log("===========================================================");
	console.log("getName:");
	dbo.collection('details').find().toArray(function(err, result) {
		var numsId = Number(sId);
		console.log(numsId);
		for(i = 0; i < result.length; i++) {
			console.log(result[i].id);
			if(result[i].id == numsId){
				res.send(result[i].name);
			}
		}
	})
}

/*
Clears a canvas

Params:
	dbo    : object 	 : database connection
	bookId : string      : book id number
	pageId : string      : page id number
	res    : file stream : response stream

Returns:
	none
*/

async function clearCanvases(dbo, bookId, pageId, res) {
	console.log("===========================================================");
	console.log("clearCanvases:");
	var numBookId = Number(bookId);
	var numPageId = Number(pageId);
	var book = await dbo.collection('book').findOne({bookId: numBookId});
	var creators = await getCreator(dbo, bookId, pageId, null);
	var newCreators = creators;
	for (i = 0; i < newCreators.length; i++) {
		newCreators[i].canvas = "";
	}
	book.pages[numPageId].creators = newCreators;
	book.pages[numPageId].active = true;
	console.log("fresh canvas\n" + book.pages[numPageId].creators);
	dbo.collection('book').replaceOne({bookId: numBookId}, book);
	res.send("reset canvas for each creator");
}

/*
Deletes a creator

Params:
	dbo       : object 	    : database connection
	res       : file stream : response stream
	studentId : string      : a student id number
	bookId    : string      : a book id number
	pageId    : string      : a page id number

Returns:
	none
*/

async function deleteCreator(dbo, res, studentId, bookId, pageId) {
	console.log("===========================================================");
	console.log("deleteCreator:");
	var numBookId = Number(bookId);
	var numStudentId = Number(studentId);
	var numPageId = Number(pageId);
	var book = await dbo.collection('book').findOne({bookId:numBookId});
	console.log(book);
	for(i = 0; i < book.pages.length; i++) {
		if(book.pages[i].pagenum == numPageId) {
			for(j = 0; j < book.pages[i].creators.length; j++){
				if(book.pages[i].creators[j].studentId == numStudentId) {
					if(book.pages[i].active != "true" ) {
						res.send("page is complete");
						return;
					}
					var newCreators = book.pages[i].creators.splice(j,1);
				}
			}
		}
	}
	dbo.collection('book').replaceOne({bookId:numBookId}, book);
	res.send('its deleted it or it never existed');
}

/*
Gets all a users books

Params:
	dbo       : object 	    : database connection
	res       : file stream : response stream
	studentId : string 	    : student id number

Returns:
	array<object> : all the books
*/

async function getMyBooks(dbo, res, studentId){ 
	console.log("===========================================================");
	console.log("getMyBooks:");
	numStudentId = Number(studentId);
	var allBooks = await dbo.collection('book').find({});
	allBooks = await allBooks.toArray();
	console.log(allBooks);
	var myBooks = [];
	for(i = 0; i < allBooks.length; i++) {
		var thePages = allBooks[i].pages;
		for(j = 0; j < thePages.length; j++) {
			var theCreators = thePages[j].creators;
			for(c = 0; c < theCreators.length; c++) {
				if(theCreators[c].studentId == numStudentId) {
					if(!myBooks.includes(allBooks[i])) {
						myBooks.push(allBooks[i]);
					}
				}
			}
		}
	}
	res.send(myBooks);
}

/*
Gets a book name from a book id

Params:
	dbo    : object 	 : database connection
	res    : file stream : response fileStream
	bookId : string 	 : book id number

Returns:
	string : the books name
*/

async function getBookName(dbo, res, bookId) {
	console.log("===========================================================");
	console.log("getBookName:");
	var numBookId = Number(bookId);
	var book = await dbo.collection('book').findOne({bookId:numBookId});
	console.log(book);
	res.send(book.bookTitle);
}

/*
Orders a creators object to prepare for merging

Params:
	creators : array<object> : an array of creator objects, containing all 3 roles
*/

async function orderRoles(creators) {
    console.log("===========================================================");
    console.log("orderRoles:");
    console.log("CREAOTS HERE :" + creators);
    var ordered = ["invalid", "invalid", "invalid"];
    for (cr = 0; cr < creators.length; cr++) {
        var role = creators[cr].role;
        if (role == "background") {
            ordered[0] = creators[cr];
        } else if (role == "illustrator") {
            ordered[1] = creators[cr];
        } else if (role == "writer") {
            ordered[2] = creators[cr];
        }
    }
    var one = ordered[0].studentId;
    var two = ordered[1].studentId;
    var three = ordered[2].studentId;
    console.log("ordered creators by studentId\n" + one + ", " + two + ", "+ three);
    return ordered;
}

/*
Merges 3 canvases together

Params:
	dbo      : object        : database connection
	bookId   : string        : a book id number
	pageId   : string        : a page id number
	creators : array<object> : an array of 3 creator objects
	res      : file stream   : response stream 

Returns:
	none
*/

async function mergeCanvases(dbo, bookId, pageId, creators, res) {
	console.log("===========================================================");
	console.log("mergeCanvases:");
	console.log("CREATORS BACK ONE :" + creators);
	var creators = await orderRoles(creators);
	var image1 = creators[0].canvas;
	var image2 = creators[1].canvas;
	var image3 = creators[2].canvas;
	console.log(image3);
	var desc = "data:image/png;base64,";
	var mergedImage;
	mergeImages([
		{src: desc + image1, x: 0, y: 0},
		{src: desc + image2, x: 0, y: 0},
		{src: desc + image3, x: 0, y: 0}
		], {
			Canvas: Canvas,
			Image: Image
		}).then(base64 => {
			mergedImage = base64.split("base64,")[1];
			saveMerge(mergedImage, bookId, pageId, res, dbo);
		});
	}

/*
Clears the final image of a page of a book

Params:
	dbo    : object      : database connection
	bookId : string      : book id number
	pageId : string      : page id number
	res    : file stream : response stream 

Returns:
	none
*/

async function clearFinalImage(dbo, bookId, pageId, res) {
	var numBook = Number(bookId);
	var numPage = Number(pageId);
	var book = await dbo.collection('book').findOne({bookId: numBook});
	book.pages[numPage].finalImage = "";
	dbo.collection('book').replaceOne({bookId: numBook}, book);
	res.send("finalImage is reset for book " + numBook + " at page " + numPage);
}

/*
Saves a merged image to the db

Params:
    mergedImage : string      : base64 string of image
    bookId      : string      : id number of a book
    pageId      : string      : id number of a page
    res         : file stream : response stream
    dbo         : object      : database connection

Returns:
   none
*/

async function saveMerge(mergedImage, bookId, pageId, res, dbo) {
	var numBookId = Number(bookId);
	var numPageId = Number(pageId);
	console.log("async :" + mergedImage);
	var book = await dbo.collection('book').findOne({bookId: numBookId});
	book.pages[numPageId].finalImage = mergedImage;
	book.pages[numPageId].active = false;
	dbo.collection('book').replaceOne({bookId: numBookId}, book);
}

/***********************************

Everything below here is calling the 
aobve functions when it receives an
http request on its url, if any 
function above has a return that you
cannot see, it is sent in the below
function.

***********************************/

app.get('/addPages', async function(req, res) {
    db = await MongoClient.connect(url);
    var dbo = await db.db('books');
    addPages(dbo, req.query.bookId, req.query.number, res);
})

app.get("/addTheme", async function(req, res) {
        db = await MongoClient.connect(url);
        var dbo = await db.db("books");
        addTheme(dbo, res, req.query.bookId, req.query.pageId, req.query.theme);
})

app.get('/clearFinalImage', async function(req, res) {
	db = await MongoClient.connect(url);
	var dbo = await db.db('books');
	clearFinalImage(dbo, req.query.bookId, req.query.pageId, res);
})

app.get('/clearCanvases', async function(req, res) {
	db = await MongoClient.connect(url);
	var dbo = await db.db('books');
	clearCanvases(dbo, req.query.bookId, req.query.pageId, res);
})

app.get('/merge', async function(req, res){
    db = await MongoClient.connect(url);
    var dbo = await db.db('books');
    var book = req.query.bookId;
    var page = req.query.pageId;
    var creators = await getCreator(dbo, book, page, null);
    mergeCanvases(dbo, req.query.bookId, req.query.pageId, creators, res);
})

app.get('/getBookName', async function(req, res) {
	db = await MongoClient.connect(url);
	var dbo = await db.db('books');
	getBookName(dbo, res, req.query.bookId);
})

app.get('/getMyBooks', async function(req, res) {
	db = await MongoClient.connect(url);
	var dbo = await db.db('books');
	getMyBooks(dbo, res, req.query.studentId);
})

app.get('/deleteCreator', async function(req, res) {
	db = await MongoClient.connect(url);
	var dbo = await db.db('books');
	deleteCreator(dbo, res, req.query.studentId, req.query.bookId, req.query.pageId);
})

app.get('/getName', async function(req, res) {
	console.log('henlo');
	db = await MongoClient.connect(url);
	var dbo = await db.db('login');
	getName(dbo, res, req.query.sId);
})

app.get('/deleteBook', async function(req, res) {
	console.log('bookus deletus');
	db = await MongoClient.connect(url);
	var dbo = await db.db('books');
	deleteBook(dbo, res, req.query.bookId);
})

app.get('/getSchools', async function(req, res) {
	db = await MongoClient.connect(url);
	var dbo = await db.db('login');
	getSchools(dbo, res);
})

app.get('/getRole', async function(req, res) {
	db = await MongoClient.connect(url);
	var dbo = await db.db('books');
	console.log("book: " + req.query.bookId + " page: " + req.query.pageId + " stId: " + req.query.studentId);
	getRole(dbo, req.query.bookId, req.query.pageId, req.query.studentId, res);
})

app.get('/getClassStudents', async function(req,res) {
	db = await MongoClient.connect(url);
	var dbo = await db.db('login');
	getClassStudents(dbo, res, req.query.classId, req.query.school);
})

app.post('/addImageToCreator', async function(req, res) {
	db = await MongoClient.connect(url);
	var dbo = await db.db('books');
	var bookId = req.body.bookId;
	var pageId = req.body.pageId;
	var studentId = req.body.studentId;
	var image = req.body.image;
	console.log("book: " + req.body.bookId + " pageId: " + req.body.pageId + " studentId: " + req.body.studentId); 
	var img = await addImageToCreator(dbo, bookId, pageId, studentId, image, res);
	if (img == "true") {
		var creators = await getCreator(dbo, bookId, pageId, null);
		var a = await checkIfCanvasEmpty(creators);
		if(a == true){
			var merged = await mergeCanvases(dbo, bookId, pageId,  creators, res);
		}
	}
	res.send("success");
})

app.get('/getSchoolBooks', async function(req, res) {
	db = await MongoClient.connect(url);
	var dbo = await db.db('books');
	getSchoolBooks(dbo, req.query.school, res);
})

app.get('/getClassBooks', async function(req, res) {
	db = await MongoClient.connect(url);
	var dbo = await db.db('books');
	getClassBooks(dbo, req.query.classId, req.query.school ,res);
})

app.get('/getPages', async function(req, res) {
	db = await MongoClient.connect(url);
	var dbo = await db.db('books');
	getPages(dbo, req.query.bookId, res);
})

app.get('/getCreator', async function(req, res) {
	db = await MongoClient.connect(url);
	var dbo = await db.db('books');
	getCreator(dbo, req.query.bookId, req.query.pageId, res);
})

app.get('/getPage', async function(req, res) {
	db = await MongoClient.connect(url);
	var dbo = await db.db('books');
	getPage(dbo, req.query.bookId, req.query.pageId, res);
})

app.get('/getBook', async function(req, res) {
	db = await MongoClient.connect(url);
	var dbo = await db.db('books');
	getBook(dbo, req.query.bookId, res);
})

app.get('/addDetails', async function(req, res) {
	db = await MongoClient.connect(url);
	var dbo = await db.db('books');
	addCreator(req.query.bookID, req.query.pageID, dbo, req.query.sID, req.query.role, res);
})

app.get('/createPage', async function(req, res) {
	db = await MongoClient.connect(url);
	var dbo = await db.db('books');
	addPage2(req.query.id, dbo, res);
})

app.get('/book', function(req, res) {
	addBook(req.query.bookTitle,req.query.bookCoverLink,req.query.school,req.query.classID, res);
})

app.get('/login', function (req, res) {
	login(res, req.query.email, req.query.password);
})

app.get('/register', function (req, res) {
	console.log('got reg req g respect');
	insertStudent(res, req.query.name, req.query.email, req.query.password, req.query.type, req.query.school, req.query.classnum);
	res.send("finished registration");
})

app.get('/', function (req, res) {
	res.send("universally challenged api");
})

app.post('/', function(req, res){
	res.send("got post");
})

app.listen(port, () => console.log(`Example app listening on port ${port}!`))

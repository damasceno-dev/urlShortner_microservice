require('dotenv').config();
import cors from 'cors'
import express from 'express'
import * as dns from 'dns';
const app = express();

const mongoose = require("mongoose");
const mongoURI = process.env['MONGO_URI']

// Basic Configuration
const port = process.env.PORT || 3333;
mongoose.connect(mongoURI);

const urlParserSchema = new mongoose.Schema({
  id: { type: Number, required: true },
  url: { type: String, required: true },
});

let ParsedUrl = mongoose.model('ParsedUrl', urlParserSchema);

app.use(cors());
app.use('/public', express.static(`${process.cwd()}/public`));


//for getting values from form using req.body
app.use(express.json());
app.use(express.urlencoded())


app.get('/', function(req, res) {
  res.sendFile(process.cwd() + '/views/index.html');
});

function isValidUrl(urlString: string): boolean {
  var urlPattern = new RegExp('^(https?:\\/\\/)?' + // validate protocol
    '((([a-z\\d]([a-z\\d-]*[a-z\\d])*)\\.)+[a-z]{2,}|' + // validate domain name
    '((\\d{1,3}\\.){3}\\d{1,3}))' + // validate OR ip (v4) address
    '(\\:\\d+)?(\\/[-a-z\\d%_.~+]*)*' + // validate port and path
    '(\\?[;&a-z\\d%_.~+=-]*)?' + // validate query string
    '(\\#[-a-z\\d_]*)?$', 'i'); // validate fragment locator
  console.log('result of format verification: ', !!urlPattern.test(urlString))
  return !!urlPattern.test(urlString);
}
async function isDnsValid(url: string): Promise<boolean> {
  try {
    const parsedUrl = new URL(url);
    const hostname = parsedUrl.hostname;

    const address = await new Promise((resolve, reject) => {
      dns.lookup(hostname, (err: NodeJS.ErrnoException | null, address: string) => {
        if (err) {
          reject(err);
        } else {
          resolve(address);
        }
      });
    });

    console.log(`${url} exists. IP address: ${address}`);
    return true;
  } catch (err) {
    if (err instanceof Error) {
      console.error(`${url} does not exist. Error: ${err.message}`);
    }
    return false;
  }
}

let resObject = {};

app.all('/api/shorturl', async (req, res) => {
  if (req.method === 'POST') {
    const url = req.body.url.trim();
    const dnsValid = await isDnsValid(url);
    
    if (!dnsValid) {
       resObject = { error: "invalid url" };
    } else if (!isValidUrl(url)) {
       resObject = { error: "invalid URL format" };
    } else {
      //VERIFY IF STRING EXISTS IN DATABASE
      const existingUrl = await ParsedUrl.findOne({ url: url }).exec();
      if (existingUrl) {
        //IF EXISTS, RETURN ITS ID
        resObject = { "original_url": existingUrl.url, "short_url": existingUrl.id }
      } else {     
        //ELSE, REGISTER IN DATABASE AND RETURN ITS ID
        const latestRegister = await ParsedUrl.findOne().sort({ _id: -1 });
        let nextId = 0;
        if (latestRegister.length !== 0) {
          //ITS NOT THE FIRST ENTRY IN DATABASE
          nextId = latestRegister.id + 1;
        } else {
          const newUrl = new ParsedUrl({ id: nextId, url: url });
          await newUrl.save();
        
          const urlJustCreated = await ParsedUrl.findOne({ url: url }).exec();
        
          resObject = { "original_url": urlJustCreated.url, "short_url": urlJustCreated.id }
        }
      }
    }
    res.redirect('/api/shorturl');
  }
  else if (req.method === 'GET') {
    return res.json(resObject);
  }
  
})

app.get('/api/shorturl/:id', async (req, res) => {
  const id = req.params.id;
  const urlToRedirect = await ParsedUrl.findOne({ id: id }).exec();
  res.redirect(urlToRedirect.url);
})

app.post('test/api/shorturl', async (req, res) => {
  const url = req.body.url.trim();

  if (!isValidUrl(url)) {
    return res.json({ error: "invalid URL format" });
  }

  if (!isDnsValid(url)) {
    return res.json({ error: "invalid url" });
  }

  const existingUrl = await ParsedUrl.findOne({ url: url }).exec();

  //VERIFY IF STRING EXISTS IN DATABASE
  if (existingUrl) {
    //IF EXISTS, RETURN ITS ID
    return res.json({ "original_url": existingUrl.url, "short_url": existingUrl.id })
  }
  //ELSE, REGISTER ON DATABASE AND RETURN ITS ID
  const latestRegister = await ParsedUrl.findOne().sort({ _id: -1 });
  let nextId = 0;
  if (latestRegister.length !== 0) {
    nextId = latestRegister.id + 1;
  }
  const newUrl = new ParsedUrl({ id: nextId, url: url });
  await newUrl.save();

  const urlJustCreated = await ParsedUrl.findOne({ url: url }).exec();

  return res.json({ "original_url": urlJustCreated.url, "short_url": urlJustCreated.id })

});

app.listen(port, function() {
  console.log(`Listening on port ${port}`);
});

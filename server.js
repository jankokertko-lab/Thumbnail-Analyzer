// server.js
import express from 'express';
import fetch from 'node-fetch';
import sharp from 'sharp';
import cors from 'cors';

const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(cors());

const YT_API = 'AIzaSyCc31AHj2nfFQmUvz128NoAlYgmPDoXLx8'; // your API key

// Helper: simple feature extraction from resized image
function computeFeatures(imageData) {
  const data = imageData.data;
  const pixels = data.length / 3;
  let brightnessSum = 0;
  let edgeSum = 0;
  for (let i = 0; i < pixels; i++) {
    const r = data[i*3], g = data[i*3+1], b = data[i*3+2];
    const avg = (r+g+b)/3;
    brightnessSum += avg;
    // simple edge proxy: difference with previous pixel
    if(i>0){
      const prev=(i-1)*3;
      edgeSum+=Math.abs(r-data[prev])+Math.abs(g-data[prev+1])+Math.abs(b-data[prev+2]);
    }
  }
  return { brightness: brightnessSum/pixels, edge: edgeSum/pixels };
}

// Compare user features to dataset features
function compareDistributions(user, dataset){
  const brightnessValues = dataset.map(d=>d.brightness);
  const edgeValues = dataset.map(d=>d.edge);

  const brightnessPercentile = brightnessValues.filter(v=>user.brightness>v).length / dataset.length * 10;
  const edgePercentile = edgeValues.filter(v=>user.edge>v).length / dataset.length * 10;

  // Weighted final score
  const score = Math.min(10,(brightnessPercentile*0.5 + edgePercentile*0.5)).toFixed(1);
  return { brightnessPercentile, edgePercentile, score };
}

app.post('/compare', async (req,res)=>{
  try {
    const { imageBase64, category } = req.body;

    // 1️⃣ Fetch YouTube thumbnails for category
    const searchURL = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(category)}&type=video&maxResults=20&key=${YT_API}`;
    const searchRes = await fetch(searchURL);
    const searchData = await searchRes.json();

    const urls = searchData.items.map(item => item.snippet.thumbnails.high.url);

    // 2️⃣ Analyze dataset thumbnails
    const datasetFeatures = [];
    for (const url of urls) {
      const imageRes = await fetch(url);
      const buffer = Buffer.from(await imageRes.arrayBuffer());
      const imageData = await sharp(buffer)
        .resize(200,200)
        .raw()
        .toBuffer({ resolveWithObject: true });
      datasetFeatures.push(computeFeatures(imageData));
    }

    // 3️⃣ Analyze user thumbnail
    const userBuffer = Buffer.from(imageBase64.split(',')[1], 'base64');
    const userData = await sharp(userBuffer)
      .resize(200,200)
      .raw()
      .toBuffer({ resolveWithObject: true });
    const userFeatures = computeFeatures(userData);

    // 4️⃣ Compare
    const comparison = compareDistributions(userFeatures,datasetFeatures);

    res.json({ userFeatures, comparison });

  } catch(e){
    console.error(e);
    res.status(500).json({error:e.message});
  }
});

app.listen(3000, ()=>console.log('Server running on http://localhost:3000'));

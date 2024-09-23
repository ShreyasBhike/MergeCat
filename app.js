const express = require("express");
const ffmpegStatic = require("ffmpeg-static");
const ffmpeg = require("fluent-ffmpeg");
const path = require("path");
const multer = require("multer");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;

// Multer configuration to handle video uploads
const upload = multer({ dest: 'uploads/' });

ffmpeg.setFfmpegPath(ffmpegStatic);

// Update output directory to be inside the project folder
const outputDir = path.join(__dirname, "output");

// Ensure output directory exists
if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
    console.log(`Created output directory: ${outputDir}`);
}

// Endpoint to concatenate videos
app.post("/concat-videos", upload.fields([{ name: 'video1' }, { name: 'video2' }]), (req, res) => {
    console.log("Received request to concat videos");
    
    if (!req.files || !req.files.video1 || !req.files.video2) {
        console.error("Missing video files in request");
        return res.status(400).json({ success: false, message: "Please upload both video files." });
    }

    const video1 = req.files.video1[0].path;
    const video2 = req.files.video2[0].path;
    console.log("Received videos:", video1, video2);

    // Check if files exist and log their sizes
    [video1, video2].forEach(file => {
        if (fs.existsSync(file)) {
            const stats = fs.statSync(file);
            console.log(`File ${file} exists, size: ${stats.size} bytes`);
        } else {
            console.error(`File ${file} does not exist`);
        }
    });

    // Generate a timestamp for the output file name
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const outputFilePath = path.join(outputDir, `concatenated-${timestamp}.mp4`);
    console.log("Output file path:", outputFilePath);

    // Create a text file with paths to the videos for FFmpeg concat
    const concatFilePath = path.join(__dirname, 'filelist.txt');
    fs.writeFileSync(concatFilePath, `file '${video1}'\nfile '${video2}'`);
    console.log("Created concat file list:", concatFilePath);
    console.log("Content of filelist.txt:", fs.readFileSync(concatFilePath, 'utf8'));

    // Use FFmpeg's concat protocol to concatenate videos
    ffmpeg()
        .input(concatFilePath)
        .inputFormat('concat')
        .outputOptions('-c', 'copy')
        .on('start', (cmd) => console.log('FFmpeg command:', cmd))
        .on('stderr', (stderrLine) => console.log('FFmpeg stderr:', stderrLine))
        .on('progress', (progress) => {
            console.log('Processing: ' + progress.percent + '% done');
        })
        .on('end', () => {
            console.log("Video concatenation completed. Output file:", outputFilePath);
            if (fs.existsSync(outputFilePath)) {
                const stats = fs.statSync(outputFilePath);
                console.log(`Output file exists, size: ${stats.size} bytes`);

                // Generate full download URL for the concatenated file
                const downloadURL = `${req.protocol}://${req.get('host')}/output/${path.basename(outputFilePath)}`;
                
                // Send the custom response with the download URL

                res.download(outputFilePath, (err) => {
                    if (err) {
                        console.error("Error triggering file download:", err);
                    } else {
                        console.log("Download started for file:", outputFilePath);
                    }
                });
                res.json({ success: true, downloadUrl: downloadURL });

               

                console.log("Starting cleanup");
                // Schedule deletion after 1 minute (60,000 milliseconds)
                setTimeout(() => {
                    fs.unlink(outputFilePath, (err) => {
                        if (err) console.error(`Error deleting ${outputFilePath}:`, err);
                        else console.log(`Deleted ${outputFilePath} after 1 minute`);
                    });
                }, 60 * 1000); // 1 minute in milliseconds

                // Cleanup uploaded files
                [video1, video2, concatFilePath].forEach(file => {
                    fs.unlink(file, (err) => {
                        if (err) console.error(`Error deleting ${file}:`, err);
                        else console.log(`Deleted ${file}`);
                    });
                });
            } else {
                console.error("Output file was not created");
                res.status(500).json({ success: false, message: "Error: Output file was not created." });
            }
        })
        .on("error", (err, stdout, stderr) => {
            console.error("Error during concatenation:", err);
            console.error("FFmpeg stdout:", stdout);
            console.error("FFmpeg stderr:", stderr);
            res.status(500).json({ success: false, message: "Error processing videos." });
        })
        .save(outputFilePath);
});

// 25-minute timer to check if the server is active
const checkInterval = 25 * 60 * 1000; // 25 minutes in milliseconds

setInterval(() => {
    console.log("Server is still running. Next check in 25 minutes.");
}, checkInterval);


// Serve the output directory for download
app.use('/output', express.static(outputDir));

app.get("/", (req, res) => {
    res.send("Hello World!");
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});

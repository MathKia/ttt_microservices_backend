import express, { response } from "express";
import axios from "axios";  
import cors from "cors";  // Import the CORS package
import env from "dotenv";
import cookieParser from "cookie-parser";

// allow env variables to be configured
env.config();

const app = express();
const PORT = process.env.API_GW_PORT;
const originURL = process.env.REACT_ORIGIN_URL //cloudfront ur
const auth_service = process.env.AUTH_ADD
const room_service = process.env.ROOM_ADD
const game_service = process.env.GAME_ADD
const chat_service = process.env.CHAT_ADD

app.use(express.json());
app.use(cookieParser())
app.use(cors({
    origin: [originURL, game_service, chat_service],  // Allow frontend (React) to make requests
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type", "Authorization", "Accept"],
    credentials: true
  }));

// Forward login request to Login Service
app.use("/api/auth", async (req, res) => {
    console.log(`API Gateway received '/api/auth' request for ${req.path}, forwarding to Login Service`);

    try {
         // Preserve headers from the original request
         /* manually set the below header so that python desktop req has necessary header elements for axios req to pass */
         const headers = {
            'Content-Type': req.get('Content-Type'),
            'User-Agent': req.get('User-Agent') || 'python-requests/2.32.3',
            'Accept': req.get('Accept') || '*/*',
            'Connection': req.get('Connection') || 'keep-alive',
            'Origin': req.get('Origin') || originURL,
            'Referer': req.get('Referer') || originURL,
            'Accept-Encoding': req.get('Accept-Encoding') || 'gzip, deflate',
            'Accept-Language': req.get('Accept-Language') || 'en-US,en;q=0.9',
             // 🔥 Add Authorization header if present
            'Authorization': req.get('Authorization') || '',
            'Cookie': req.get('Cookie') || '', // Forward cookies manually if needed
        };

        const response = await axios({
            method: req.method,
            url: `${auth_service}${req.originalUrl}`, // Forward full path
            data: req.body,
            headers: headers,
            withCredentials: true, // Ensure cookies are included
        });

        console.log("Response from auth service:", response.data);  // Log response from auth service

         // 🔧 Forward set-cookie header manually
         const setCookieHeader = response.headers["set-cookie"]; // get the res.cookie object sent from auth service in the response header under 'set-cookie' name
         if (setCookieHeader) {
             res.setHeader("set-cookie", setCookieHeader); // if there is a cookie then set API GW res back to frontend with explicit set cookie header
         }
         
         console.log(response.data)
         return res.status(response.status).json(response.data); // send back the JSON response object from auth service for status update
    } catch (error) {
        // Check if error has a response object (e.g., 400, 401 from auth service)
        if (error.response) {
            // Forward the error from auth service to the 
            console.log(error.response.data.message)
            return res.status(error.response.status).json({
                success: false,
                message: error.response.data.message || "Unknown error",
                error: error.response.data.error || error.message,
            });
        }
        // If no response (e.g., network issues), log and forward generic server error
        console.log("server error")
        return res.status(500).json({ success: false, message: "Server error" });
    }
});

// Forward room request to Room Manager Service
app.use("/api/room", async (req, res) => {
    console.log(`API Gateway received '/api/room' request for ${req.path}, forwarding to Room Man Service`);
    console.log(req.body, req.query)
    console.log(`${room_service}${req.originalUrl}`)
    
    try {

        const headers = {
            'Content-Type': req.get('Content-Type'),
            'User-Agent': req.get('User-Agent') || 'python-requests/2.32.3',
            'Accept': req.get('Accept') || '*/*',
            'Connection': req.get('Connection') || 'keep-alive',
            'Origin': req.get('Origin') || originURL,
            'Referer': req.get('Referer') || originURL,
            'Accept-Encoding': req.get('Accept-Encoding') || 'gzip, deflate',
            'Accept-Language': req.get('Accept-Language') || 'en-US,en;q=0.9',
             // 🔥 Add Authorization header if present
            'Authorization': req.get('Authorization') || '',
            'Cookie': req.get('Cookie') || '', // Forward cookies manually if needed
        };

        const response = await axios({
            method: req.method,
            url: `${room_service}${req.originalUrl}`, // Forward full path
            data: req.body,
            headers: headers, // Automatically includes cookies
            withCredentials: true, // Ensure cookies are included
        });
        
        // 🔧 Forward set-cookie header manually
        const setCookieHeader = response.headers["set-cookie"]; // get the res.cookie object sent from auth service in the response header under 'set-cookie' name
        if (setCookieHeader) {
            res.setHeader("set-cookie", setCookieHeader); // if there is a cookie then set API GW res back to frontend with explicit set cookie header
        }

        return res.status(response.status).json(response.data); // send back the JSON response object from auth service for status update
  
    } catch (error) {
        console.error("Error forwarding request:", error);
        return res.status(500).json({ success: false, message: "Server error" });
    }
});


app.listen(PORT, () => console.log(`API Gateway running on port ${PORT}`));
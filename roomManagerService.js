import express from "express";
import cors from "cors";
import roomRoutes from "./roomManagerRoutes.js"; // Import the room router
import cookieParser from "cookie-parser";
import env from "dotenv";

env.config();
const PORT = process.env.ROOM_PORT;
const app = express();

// CORS configuration
const corsOptions = {
    origin: [process.env.API_GW_ADD],  // Allow only API Gateway
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true
};

app.use(cors(corsOptions));
app.use(express.json());
app.use(cookieParser());

// Use the login routes
app.use("/api/room", (req, res, next) => {
    console.log(`api gateway 'api/room' req for ${req.path} ... sending to auth router`);
    next();
}, roomRoutes);

app.listen(PORT, () => console.log(`Room Man Service running on port ${PORT}`));

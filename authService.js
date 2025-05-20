import express from "express";
import cors from "cors";
import authRoutes from "./authRoutes.js"; // Import the auth router
import cookieParser from "cookie-parser";
import env from "dotenv";

env.config()

const app = express();
const PORT = process.env.AUTH_PORT;
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
app.use("/api/auth", (req, res, next) => {
    console.log(`api gateway 'api/auth' req for ${req.path} ... sending to auth router`);
    next();
}, authRoutes);

app.listen(PORT, () => console.log(`Login Service running on port ${PORT}`));

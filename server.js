import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { v2 as cloudinary } from 'cloudinary';
import { CloudinaryStorage } from 'multer-storage-cloudinary';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// CORS Config - Allow requests from Frontend
app.use(cors({
    origin: '*', // To allow Netlify and Vercel domains later
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true
}));
app.use(express.json());

// MongoDB Connection
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/rappani_store';
mongoose.connect(MONGO_URI)
    .then(() => console.log('Connected to MongoDB'))
    .catch(err => console.error('Failed to connect to MongoDB', err));

// MongoDB Schema & Model
const productSchema = new mongoose.Schema({
    name: { type: String, required: true },
    category: { type: String, required: true },
    price: { type: Number, required: true },
    image: { type: String, required: true },
}, { timestamps: true });

// Convert _id to id when sending to frontend
productSchema.set('toJSON', {
    transform: (document, returnedObject) => {
        returnedObject.id = returnedObject._id.toString();
        delete returnedObject._id;
        delete returnedObject.__v;
    }
});

const Product = mongoose.model('Product', productSchema);

// Cloudinary Configuration
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'demo',
    api_key: process.env.CLOUDINARY_API_KEY || '123456789012345',
    api_secret: process.env.CLOUDINARY_API_SECRET || 'abcdefghijklmnopqrstuvwxyz'
});

// Multer + Cloudinary Storage Setup
const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'rappani_store_products',
        allowed_formats: ['jpg', 'png', 'jpeg', 'webp']
    }
});

const upload = multer({ storage: storage });

// Seed default products if empty (Run once)
const seedDB = async () => {
    try {
        const count = await Product.countDocuments();
        if (count === 0) {
            console.log('Seeding database with default products...');
            const defaultProducts = [
                { name: 'Premium Ruled Notebook', category: 'Stationary', price: 120, image: 'https://picsum.photos/seed/notebook/400/400' },
                { name: 'Color Pen Set (12 Pcs)', category: 'Stationary', price: 150, image: 'https://picsum.photos/seed/pens/400/400' },
                { name: 'Birthday Gift Box', category: 'Fancy', price: 450, image: 'https://picsum.photos/seed/giftbox/400/400' },
                { name: 'Cute Teddy Bear', category: 'Fancy', price: 600, image: 'https://picsum.photos/seed/teddy/400/400' },
            ];
            await Product.insertMany(defaultProducts);
            console.log('Database seeded successfully.');
        }
    } catch (error) {
        console.error('Error seeding database:', error);
    }
};
mongoose.connection.once('connected', seedDB);

// Routes
// 1. Get all products
app.get('/api/products', async (req, res) => {
    try {
        const products = await Product.find({}).sort({ createdAt: -1 });
        res.json(products);
    } catch (error) {
        console.error('Fetch error:', error);
        res.status(500).json({ error: 'Failed to fetch products' });
    }
});

// 2. Add a product (with image upload to Cloudinary)
app.post('/api/products', upload.single('imageFile'), async (req, res) => {
    try {
        const { name, category, price, imageUrl } = req.body;
        let image = imageUrl;

        // If an image was uploaded, use the Cloudinary URL
        if (req.file) {
            image = req.file.path;
        }

        if (!name || !category || !price || !image) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const newProduct = new Product({ name, category, price: Number(price), image });
        const savedProduct = await newProduct.save();

        res.status(201).json(savedProduct);
    } catch (error) {
        console.error('Add error:', error);
        res.status(500).json({ error: 'Failed to add product' });
    }
});

// 3. Update a product
app.put('/api/products/:id', upload.single('imageFile'), async (req, res) => {
    try {
        const { id } = req.params;
        const { name, category, price, imageUrl } = req.body;

        const existingProduct = await Product.findById(id);
        if (!existingProduct) {
            return res.status(404).json({ error: 'Product not found' });
        }

        let image = existingProduct.image;
        if (req.file) {
            image = req.file.path; // New image from Cloudinary
        } else if (imageUrl) {
            image = imageUrl; // URL directly provided
        }

        existingProduct.name = name || existingProduct.name;
        existingProduct.category = category || existingProduct.category;
        existingProduct.price = price ? Number(price) : existingProduct.price;
        existingProduct.image = image;

        const updatedProduct = await existingProduct.save();
        res.json(updatedProduct);
    } catch (error) {
        console.error('Update error:', error);
        res.status(500).json({ error: 'Failed to update product' });
    }
});

// 4. Delete a product
app.delete('/api/products/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const deletedProduct = await Product.findByIdAndDelete(id);

        if (!deletedProduct) {
            return res.status(404).json({ error: 'Product not found' });
        }
        res.json({ success: true, message: 'Product deleted' });
    } catch (error) {
        console.error('Delete error:', error);
        res.status(500).json({ error: 'Failed to delete product' });
    }
});

app.listen(PORT, () => {
    console.log(`Backend server running on http://localhost:${PORT}`);
});

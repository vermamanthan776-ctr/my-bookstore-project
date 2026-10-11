require('dotenv').config();

const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "1234";

const express = require('express');
const app = express()
const port = 3000

const mongoose = require('mongoose');
const multer = require('multer');
const nodemailer = require('nodemailer');
const session = require('express-session');

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'public/uploads/')
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + '-' + file.originalname)
    }
})

const upload = multer({ storage: storage });

function createMailTransport() {
    const host = process.env.SMTP_HOST || 'smtp.gmail.com';
    const port = Number(process.env.SMTP_PORT || 587);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error('SMTP_PORT must be a valid port number.');
    }

    const user = process.env.SMTP_USER?.trim();
    const pass = process.env.SMTP_PASS?.replace(/\s/g, '');
    return nodemailer.createTransport({
        host,
        port,
        secure: process.env.SMTP_SECURE
            ? process.env.SMTP_SECURE.trim().toLowerCase() === 'true'
            : port === 465,
        auth: user && pass ? { user, pass } : undefined
    });
}

const transport = createMailTransport();

async function main() {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/bookstore');
}
main()
.then(() => {console.log('Connected to MongoDB')})
.catch(err => console.log(err));

const bookSchema = new mongoose.Schema({
    title: String,
    author: String,
    price: Number,
    category: String,
    image: String
})

app.use(session({
    secret: process.env.SESSION_SECRET || 'bookstoresecret',
    resave: false,
    saveUninitialized: false,
}))
app.use(express.urlencoded({ extended: true }))
app.use((req, res, next) => {
    res.locals.isAdmin = Boolean(req.session.isAdmin);
    res.locals.cartCount = Object.values(req.session.cart || {})
        .reduce((count, quantity) => count + quantity, 0);
    next();
})

function isAdmin(req, res, next) {
    if(req.session.isAdmin) {
        next();
    } else {
        res.send('Access Denied');
    }
}

app.get('/admin/login', (req, res) => {
    res.render('adminlogin.ejs', { error: null });
})
app.post('/admin/login', (req, res, next) => {
    const username = typeof req.body.username === 'string' ? req.body.username.trim() : '';
    const password = req.body.password;

    if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
        req.session.isAdmin = true;
        req.session.save(error => {
            if (error) return next(error);
            res.redirect('/admin/orders');
        });
    } else {
        res.status(401).render('adminlogin.ejs', {
            error: 'That username and password did not match. Check your ADMIN_USERNAME and ADMIN_PASSWORD settings in .env.'
        });
    }
});
app.get('/admin/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
})

const Book = mongoose.model('Book', bookSchema);

const orderItemSchema = new mongoose.Schema({
    book: { type: mongoose.Schema.Types.ObjectId, ref: 'Book', required: true },
    title: { type: String, required: true },
    author: String,
    image: String,
    price: { type: Number, required: true, min: 0 },
    quantity: { type: Number, required: true, min: 1, max: 20 }
}, { _id: false });

const orderSchema = new mongoose.Schema({
    sessionId: { type: String, required: true, index: true },
    items: { type: [orderItemSchema], required: true },
    shipping: {
        name: { type: String, required: true },
        phone: { type: String, required: true },
        address: { type: String, required: true },
        city: { type: String, required: true },
        postalCode: { type: String, required: true }
    },
    total: { type: Number, required: true, min: 0 },
    notificationStatus: {
        type: String,
        enum: ['Pending', 'Sent', 'Failed'],
        default: 'Pending'
    },
    notificationError: { type: String, default: '' },
    status: {
        type: String,
        enum: ['Processing', 'Shipped', 'Delivered', 'Cancelled'],
        default: 'Processing'
    }
}, { timestamps: true });

const Order = mongoose.model('Order', orderSchema);

async function sendOrderNotification(order) {
    const recipient = process.env.CONTACT_EMAIL?.trim() || process.env.SMTP_USER?.trim();
    const sender = process.env.SMTP_FROM?.trim() || process.env.SMTP_USER?.trim();
    if (!recipient || !sender) {
        throw new Error('Set CONTACT_EMAIL and SMTP_FROM (or SMTP_USER) in .env to send order notifications.');
    }

    const itemLines = order.items.map(item =>
        `- ${item.title} by ${item.author || 'Unknown author'} | Qty: ${item.quantity} | ₹${Number(item.price).toLocaleString('en-IN')} each | Subtotal: ₹${Number(item.price * item.quantity).toLocaleString('en-IN')}`
    );
    const shipping = order.shipping;
    const text = [
        'A new bookstore order has been placed.',
        '',
        `Order ID: ${order._id}`,
        `Placed: ${new Date(order.createdAt).toLocaleString('en-IN')}`,
        'Payment: Cash on delivery',
        '',
        'Delivery details:',
        `Name: ${shipping.name}`,
        `Phone: ${shipping.phone}`,
        `Address: ${shipping.address}`,
        `City: ${shipping.city}`,
        `Postal code: ${shipping.postalCode}`,
        '',
        'Items:',
        ...itemLines,
        '',
        `Total: ₹${Number(order.total).toLocaleString('en-IN')}`
    ].join('\n');

    await transport.sendMail({
        from: sender,
        to: recipient,
        subject: `New bookstore order #${String(order._id).slice(-8).toUpperCase()}`,
        text
    });
}

async function getCartItems(cart) {
    const entries = Object.entries(cart || {});
    const ids = entries
        .map(([id]) => id)
        .filter(id => mongoose.isValidObjectId(id));

    if (!ids.length) {
        return { items: [], staleIds: entries.map(([id]) => id) };
    }

    const books = await Book.find({ _id: { $in: ids } });
    const booksById = new Map(books.map(book => [String(book._id), book]));
    const items = [];
    const staleIds = [];

    for (const [id, quantity] of entries) {
        const book = booksById.get(id);
        if (!book) {
            staleIds.push(id);
            continue;
        }

        items.push({
            book,
            quantity,
            lineTotal: Number(book.price) * quantity
        });
    }

    return { items, staleIds };
}

function cartTotal(items) {
    return items.reduce((total, item) => total + item.lineTotal, 0);
}

function summarizeCategories(books) {
    const categories = new Map();
    for (const book of books) {
        const name = typeof book.category === 'string' ? book.category.trim() : '';
        if (!name) continue;

        const key = name.toLocaleLowerCase();
        const existing = categories.get(key);
        if (existing) {
            existing.count += 1;
        } else {
            categories.set(key, { name, count: 1, encodedName: encodeURIComponent(name) });
        }
    }

    return [...categories.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

app.set("view engine", "ejs")
app.use(express.static('public'))

app.get('/', async (req, res) => {
    const books = await Book.find({}, 'category').lean();
    res.render('home.ejs', { homeCategories: summarizeCategories(books).slice(0, 3) });
})

app.get('/about', (req, res) => {
    res.render('about.ejs')
})

app.get('/books', async (req, res) => {
    const books = await Book.find();
    res.render('books.ejs', { books, isAdmin: req.session.isAdmin});
})

app.post('/cart/add/:id', async (req, res) => {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
        return res.status(404).send('Book not found.');
    }

    const book = await Book.findById(id);
    if (!book) {
        return res.status(404).send('Book not found.');
    }

    const requestedQuantity = req.body.quantity === undefined ? 1 : Number(req.body.quantity);
    if (!Number.isInteger(requestedQuantity) || requestedQuantity < 1 || requestedQuantity > 20) {
        return res.status(400).send('Quantity must be a whole number between 1 and 20.');
    }

    const cart = req.session.cart || (req.session.cart = {});
    cart[id] = Math.min((cart[id] || 0) + requestedQuantity, 20);
    res.redirect('/cart?added=1');
});

app.post('/cart/buy/:id', async (req, res) => {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
        return res.status(404).send('Book not found.');
    }

    const book = await Book.findById(id);
    if (!book) {
        return res.status(404).send('Book not found.');
    }

    req.session.cart = { [id]: 1 };
    res.redirect('/checkout');
});

app.get('/cart', async (req, res) => {
    const { items, staleIds } = await getCartItems(req.session.cart);
    if (staleIds.length) {
        for (const id of staleIds) {
            delete req.session.cart[id];
        }
    }

    res.render('cart.ejs', {
        items,
        total: cartTotal(items),
        justAdded: req.query.added === '1',
        quantityUpdated: req.query.updated === '1',
        itemRemoved: req.query.removed === '1',
        attemptedEmptyCheckout: req.query.empty === '1',
        removedUnavailable: staleIds.length > 0
    });
});

app.post('/cart/update/:id', async (req, res) => {
    const { id } = req.params;
    const cart = req.session.cart || {};
    const quantity = Number(req.body.quantity);

    if (!Object.prototype.hasOwnProperty.call(cart, id)) {
        return res.status(404).send('This book is not in your cart.');
    }
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 20) {
        return res.status(400).send('Quantity must be a whole number between 1 and 20.');
    }

    cart[id] = quantity;
    res.redirect('/cart?updated=1');
});

app.post('/cart/remove/:id', (req, res) => {
    if (req.session.cart) {
        delete req.session.cart[req.params.id];
    }
    res.redirect('/cart?removed=1');
});

app.get('/checkout', async (req, res) => {
    const { items } = await getCartItems(req.session.cart);
    if (!items.length) {
        return res.redirect('/cart?empty=1');
    }

    res.render('checkout.ejs', {
        items,
        total: cartTotal(items),
        currentUser: { name: '' }
    });
});

app.post('/checkout', async (req, res) => {
    const { items } = await getCartItems(req.session.cart);
    if (!items.length) {
        return res.redirect('/cart?empty=1');
    }

    const shipping = {
        name: String(req.body.name || '').trim(),
        phone: String(req.body.phone || '').trim(),
        address: String(req.body.address || '').trim(),
        city: String(req.body.city || '').trim(),
        postalCode: String(req.body.postalCode || '').trim()
    };
    const fieldLimits = { name: 100, phone: 30, address: 200, city: 100, postalCode: 20 };
    const invalidField = Object.entries(fieldLimits).find(([field, maxLength]) =>
        !shipping[field] || shipping[field].length > maxLength
    );

    if (invalidField || shipping.phone.length < 7) {
        return res.status(400).send('Please enter valid delivery details and a phone number of at least 7 characters.');
    }

    const orderItems = items.map(({ book, quantity }) => ({
        book: book._id,
        title: book.title,
        author: book.author,
        image: book.image,
        price: Number(book.price),
        quantity
    }));
    if (orderItems.some(item => !Number.isFinite(item.price) || item.price < 0)) {
        return res.status(422).send('An item in your cart has an invalid price. Please contact the bookstore.');
    }

    const order = await Order.create({
        sessionId: req.sessionID,
        items: orderItems,
        shipping,
        total: cartTotal(items)
    });

    let notification = 'sent';
    try {
        await sendOrderNotification(order);
        order.notificationStatus = 'Sent';
        order.notificationError = '';
    } catch (error) {
        notification = 'failed';
        console.error(`[order-email] Failed to send notification for order ${order._id}: ${error.message}`);
        order.notificationStatus = 'Failed';
        order.notificationError = error.message;
    }
    try {
        await order.save();
    } catch (saveError) {
        console.error(`[order-email] Could not save notification status for order ${order._id}: ${saveError.message}`);
    }

    req.session.cart = {};
    res.redirect(`/orders/${order._id}?notification=${notification}`);
});

app.get('/orders', async (req, res) => {
    const orders = await Order.find({ sessionId: req.sessionID }).sort({ createdAt: -1 });
    res.render('orders.ejs', { orders });
});

app.get('/orders/:id', async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) {
        return res.status(404).send('Order not found.');
    }

    const order = req.session.isAdmin
        ? await Order.findById(req.params.id)
        : await Order.findOne({ _id: req.params.id, sessionId: req.sessionID });
    if (!order) {
        return res.status(404).send('Order not found.');
    }
    res.render('order.ejs', {
        order,
        isAdmin: Boolean(req.session.isAdmin),
        notification: ['sent', 'failed'].includes(req.query.notification) ? req.query.notification : ''
    });
});

app.get('/admin/orders', isAdmin, async (req, res) => {
    const orders = await Order.find().sort({ createdAt: -1 });
    res.render('admin-orders.ejs', {
        orders,
        notification: ['sent', 'failed'].includes(req.query.notification) ? req.query.notification : '',
        statusUpdated: req.query.status === 'updated'
    });
});

app.post('/admin/orders/:id/email', isAdmin, async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) {
        return res.status(404).send('Order not found.');
    }

    const order = await Order.findById(req.params.id);
    if (!order) {
        return res.status(404).send('Order not found.');
    }

    try {
        await sendOrderNotification(order);
        order.notificationStatus = 'Sent';
        order.notificationError = '';
    } catch (error) {
        console.error(`[order-email] Retry failed for order ${order._id}: ${error.message}`);
        order.notificationStatus = 'Failed';
        order.notificationError = error.message;
    }
    try {
        await order.save();
    } catch (saveError) {
        console.error(`[order-email] Could not save notification status for order ${order._id}: ${saveError.message}`);
    }
    res.redirect(`/admin/orders?notification=${order.notificationStatus === 'Sent' ? 'sent' : 'failed'}`);
});

app.post('/admin/orders/:id/status', isAdmin, async (req, res) => {
    const validStatuses = ['Processing', 'Shipped', 'Delivered', 'Cancelled'];
    if (!validStatuses.includes(req.body.status)) {
        return res.status(400).send('Invalid order status.');
    }
    if (!mongoose.isValidObjectId(req.params.id)) {
        return res.status(404).send('Order not found.');
    }

    const order = await Order.findById(req.params.id);
    if (!order) {
        return res.status(404).send('Order not found.');
    }
    order.status = req.body.status;
    await order.save();
    res.redirect('/admin/orders?status=updated');
});

app.get('/books/new', isAdmin, (req, res) => {
    res.render('newbook');
});

app.post('/books', isAdmin, upload.single('img'), async (req, res) => {
    const book = new Book({
        title: req.body.title,
        author: req.body.author,
        price: req.body.price,
        category: req.body.category,
        image: req.file ? '/uploads/' + req.file.filename : undefined
    });

    await book.save();
    res.redirect('/books');
});

app.post('/books/delete/:id', isAdmin, async (req, res) => {
    const id = req.params.id;
    await Book.findByIdAndDelete(id);
    res.redirect('/books');
});

app.get('/books/edit/:id',isAdmin, async (req, res) => {
    const Id = req.params.id;
    const book = await Book.findById(Id);
    res.render('editbook', { book });
});
app.post('/books/edit/:id', isAdmin, upload.single('img'), async (req, res) => {
    const book = await Book.findById(req.params.id);

    if (req.body.title) book.title = req.body.title;
    if (req.body.author) book.author = req.body.author;
    if (req.body.price) book.price = req.body.price;
    if (req.body.category) book.category = req.body.category;

    if (req.file) {
        book.image = '/uploads/' + req.file.filename;
    }

    await book.save();
    res.redirect('/books');
});

app.get('/categories', async (req, res) => {
    const books = await Book.find().lean();
    const categories = summarizeCategories(books).map(category => category.name);
    res.render('categories.ejs', { books, categories, selectedCategory: '' });
});

app.get('/categories/:category', async (req, res) => {
    const selectedCategory = req.params.category.trim();
    const allBooks = await Book.find().lean();
    const normalizedCategory = selectedCategory.toLocaleLowerCase();
    const books = allBooks.filter(book =>
        typeof book.category === 'string' &&
        book.category.trim().toLocaleLowerCase() === normalizedCategory
    );
    const categories = summarizeCategories(allBooks).map(category => category.name);
    res.render('categories.ejs', { books, categories, selectedCategory });
});

app.get('/contact', (req, res) => {
    res.render('contact.ejs', { feedback: null, formData: {} });
});

app.post('/contact', async (req, res) => {
    const formData = {
        name: typeof req.body.name === 'string' ? req.body.name.trim() : '',
        email: typeof req.body.email === 'string' ? req.body.email.trim() : '',
        mobile: typeof req.body.mobile === 'string' ? req.body.mobile.trim() : '',
        message: typeof req.body.message === 'string' ? req.body.message.trim() : ''
    };
    const recipient = process.env.CONTACT_EMAIL?.trim() || process.env.SMTP_USER?.trim();
    const smtpHost = (process.env.SMTP_HOST || 'smtp.gmail.com').trim().toLowerCase();
    const smtpPass = process.env.SMTP_PASS?.replace(/\s/g, '') || '';
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!process.env.SMTP_USER?.trim() || !process.env.SMTP_PASS?.trim() || !recipient) {
        return res.status(503).render('contact.ejs', {
            formData,
            feedback: {
                type: 'error',
                message: 'Email is not configured. Add SMTP_USER, a Gmail App Password as SMTP_PASS, and CONTACT_EMAIL to .env, then restart the app.'
            }
        });
    }

    if (smtpHost === 'smtp.gmail.com' && !/^[a-z0-9]{16}$/i.test(smtpPass)) {
        return res.status(503).render('contact.ejs', {
            formData,
            feedback: {
                type: 'error',
                message: 'SMTP_PASS is not in Google App Password format. In your Google Account, enable 2-Step Verification, create a new 16-character App Password, replace SMTP_PASS in .env (remove any spaces), then restart the app.'
            }
        });
    }

    if (!formData.name || formData.name.length > 100 ||
        !emailPattern.test(formData.email) || formData.email.length > 254 ||
        !formData.mobile || formData.mobile.length > 30 ||
        !formData.message || formData.message.length > 5000) {
        return res.status(400).render('contact.ejs', {
            formData,
            feedback: {
                type: 'error',
                message: 'Please provide a valid name, email, phone number, and message (up to 5,000 characters).'
            }
        });
    }

    try {
        await transport.sendMail({
            from: process.env.SMTP_FROM?.trim() || process.env.SMTP_USER.trim(),
            to: recipient,
            replyTo: formData.email,
            subject: `Book Store contact message from ${formData.name}`,
            text: [
                `Name: ${formData.name}`,
                `Email: ${formData.email}`,
                `Mobile: ${formData.mobile}`,
                '',
                formData.message
            ].join('\n')
        });

        return res.render('contact.ejs', {
            formData: {},
            feedback: {
                type: 'success',
                message: 'Your message was sent. We’ll get back to you soon.'
            }
        });
    } catch (error) {
        const code = error.code || 'UNKNOWN';
        const responseCode = error.responseCode;
        console.error('Contact email delivery failed:', { code, responseCode });

        let message = 'We could not send your message. Please try again in a moment.';
        if (code === 'EAUTH' || responseCode === 535) {
            message = 'Gmail rejected the SMTP login. Check that SMTP_USER is the Gmail account that created the App Password, and create a new 16-character App Password if needed. Replace SMTP_PASS in .env and restart the app.';
        } else if (code === 'ETIMEDOUT' || code === 'ECONNECTION' || code === 'ESOCKET') {
            message = 'Could not connect to Gmail. Check your internet connection and SMTP_HOST / SMTP_PORT settings, then try again.';
        }

        return res.status(502).render('contact.ejs', {
            formData,
            feedback: { type: 'error', message }
        });
    }
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})

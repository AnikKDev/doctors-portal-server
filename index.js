const express = require('express')
const app = express();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const cors = require('cors');
const port = process.env.PORT || 5000;
const jwt = require('jsonwebtoken');
const stripe = require('stripe')('sk_test_51L0hCqAAAfEXZZSuMMXaKqpsynUICB7uBVnfNBZYUKnEAblVKattXrTm2eRMzKoZfWpLui2zzR0hb92E5DyQtbjN00XDLPFwby');
require('dotenv').config();

app.use(cors());
app.use(express.json());



const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.7hnzl.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

const verifyToken = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).send({ message: 'Unauthorized' });
    }
    const token = authHeader.split(' ')[1];
    jwt.verify(token, process.env.JSON_TOKEN, (err, decoded) => {
        if (err) {
            return res.status(403).send({ message: 'forbidden access' })
        }
        req.decoded = decoded;
        next();
    })
};


async function run() {
    try {
        await client.connect();
        const serviceCollection = client.db('doctors_portal').collection('services');
        const bookingCollection = client.db('doctors_portal').collection('bookings');
        const userCollection = client.db('doctors_portal').collection('users');
        const doctorsCollection = client.db('doctors_portal').collection('doctors');
        const paymentCollection = client.db('doctors_portal').collection('payments');

        const verifyAdmin = async (req, res, next) => {
            const requester = req.decoded.email;
            const requesterAccount = await userCollection.findOne({ email: requester });
            if (requesterAccount.role === 'admin') {
                next()
            } else {
                res.status(403).send({ message: 'forbidden' })
            }
        }




        app.post("/create-payment-intent", verifyToken, async (req, res) => {
            // const { price } = req.body;
            const service = req.body;
            const price = service.price;
            const amount = price * 100;

            // Create a PaymentIntent with the order amount and currency
            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: "usd",
                payment_method_types: ['card']
                /* automatic_payment_methods: {
                  enabled: true,
                }, */
            });

            res.send({
                clientSecret: paymentIntent.client_secret
            });
        });

        app.patch('/booking/:id', async (req, res) => {
            const id = req.params.id;
            const payment = req.body;
            const filter = { _id: ObjectId(id) };
            const updatedDoc = {
                $set: {
                    paid: true,
                    transictionId: payment.transictionId,
                }
            }

            const result = await paymentCollection.insertOne(payment);
            const updatedBooking = await bookingCollection.updateOne(filter, updatedDoc);
            res.send(updatedDoc);

        })


        app.get('/service', async (req, res) => {
            const query = {};
            const cursor = serviceCollection.find(query).project({ name: 1 });
            const services = await cursor.toArray();
            res.send(services)
        })

        /* 
            api naming convention

            *app.get('/booking) //get all bookings in a collection or get more than one by query or filter
            *app.get('/booking/:id) //get a specific booking by id
            *app.post('/booking) //add a new booking
            *app.patch('/booking/:id) //update a specific booking
            *app.put('/booking/:id) //update a specific booking if exists else create. upsert ==> updated else insert 
            *app.delete('/booking/:id) //delete a specific booking

        */


        app.get('/user', verifyToken, async (req, res) => {
            const users = await userCollection.find().toArray();
            res.send(users);
        });
        app.get('/admin/:email', async (req, res) => {
            const email = req.params.email;
            const user = await userCollection.findOne({ email: email });
            const isAdmin = user.role === 'admin';
            res.send({ admin: isAdmin })
        })


        app.put('/user/admin/:email', verifyToken, verifyAdmin, async (req, res) => {
            const email = req.params.email;
            const filter = { email: email };
            const updatedDoc = {
                $set: { role: 'admin' },
            };
            const result = await userCollection.updateOne(filter, updatedDoc);

            res.send(result)


        })


        app.put('/user/:email', async (req, res) => {
            const email = req.params.email;
            const user = req.body;
            const filter = { email: email };
            const options = { upsert: true }
            const updatedDoc = {
                $set: user,
            };
            const result = await userCollection.updateOne(filter, updatedDoc, options);
            const token = jwt.sign({ email: email }, process.env.JSON_TOKEN);

            res.send({ result, token: token })
        })

        app.get('/available', async (req, res) => {
            const date = req.query.date || 'May 14, 2022';
            //    step 1: get all services
            const services = await serviceCollection.find().toArray();
            // step 2: get the booking of that day
            const query = { date: date };
            const bookings = await bookingCollection.find(query).toArray();

            // step 3: for each service find bookings for that service 
            services.forEach(service => {
                const serviceBookings = bookings.filter(b => b.treatment === service.name);
                const booked = serviceBookings.map(s => s.slot);
                // service.booked = booked; // creates an object property named, booked and sets its value to the slot
                const available = service.slots.filter(s => !booked.includes(s));
                service.slots = available;
            })
            res.send(services);

        });

        app.get('/booking/:id', verifyToken, async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) };
            const booking = await bookingCollection.findOne(query);
            res.send(booking);

        })

        app.get('/booking', verifyToken, async (req, res) => {
            const patient = req.query.patient;
            const decodedEmail = req.decoded.email;
            if (patient === decodedEmail) {
                const query = { patient: patient };
                const bookings = await bookingCollection.find(query).toArray();
                return res.send(bookings);
            } else {
                return res.status(403).send({ message: "forbidden access" })
            }

        })

        app.post('/booking', async (req, res) => {
            const booking = req.body; //it will come from client side post methods BODY(as an object).
            const query = { treatment: booking.treatment, date: booking.date, patient: booking.patient };
            const exists = await bookingCollection.findOne(query);
            if (exists) {
                return res.send({ success: false, booking: exists })
            }
            const result = await bookingCollection.insertOne(booking);
            res.send({ success: true, result })
        })
        app.get('/doctor', verifyToken, verifyAdmin, async (req, res) => {
            const doctors = await doctorsCollection.find().toArray();
            res.send(doctors)
        })
        app.post('/doctor', verifyToken, verifyAdmin, async (req, res) => {
            const doctor = req.body;
            const result = await doctorsCollection.insertOne(doctor);
            res.send(result);
        })


        app.delete('/doctor/:email', verifyToken, verifyAdmin, async (req, res) => {
            const email = req.params.email;
            const filter = { email: email };
            const result = await doctorsCollection.deleteOne(filter);
            res.send(result);
        })


    } finally {

    }
}
run().catch(console.dir);


app.get('/', (req, res) => {
    res.send('Hello World! from doctors portal')
})

app.listen(port, () => {
    console.log(`Doctors app listening on port ${port}`)
})
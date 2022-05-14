const express = require('express')
const app = express();
const { MongoClient, ServerApiVersion } = require('mongodb');
const cors = require('cors');
const port = process.env.PORT || 5000;
require('dotenv').config();

app.use(cors());
app.use(express.json());



const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.7hnzl.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });


async function run() {
    try {
        await client.connect();
        const serviceCollection = client.db('doctors_portal').collection('services');
        const bookingCollection = client.db('doctors_portal').collection('bookings');





        app.get('/service', async (req, res) => {
            const query = {};
            const cursor = serviceCollection.find(query);
            const services = await cursor.toArray();
            res.send(services)
        })

        /* 
            api naming convention

            *app.get('/booking) //get all bookings in a collection or get more than one by query or filter
            *app.get('/booking/:id) //get a specific booking by id
            *app.post('/booking) //add a new booking
            *app.patch('/booking/:id) //update a specific booking
            *app.delete('/booking/:id) //delete a specific booking

        */

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
export interface SampleFile {
  path: string;
  content: string;
}

export interface SampleProject {
  id: string;
  name: string;
  description: string;
  files: SampleFile[];
}

export const SAMPLE_PROJECTS: SampleProject[] = [
  {
    id: 'ecommerce',
    name: 'E-commerce Microservices Suite',
    description: 'Multi-service deployment with API gateway, typescript auth, python order management, postgres, and kafka.',
    files: [
      {
        path: 'docker-compose.yml',
        content: `version: '3.8'
services:
  gateway:
    image: nginx:alpine
    ports:
      - "80:80"
    depends_on:
      - auth-service
      - orders-service
  auth-service:
    build: ./auth-service
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=postgres://db:5432/auth
    depends_on:
      - db
  orders-service:
    build: ./orders-service
    ports:
      - "5000:5000"
    environment:
      - KAFKA_BOOTSTRAP_SERVERS=kafka:9092
    depends_on:
      - kafka
  db:
    image: postgres:15
    ports:
      - "5432:5432"
  kafka:
    image: kafka:latest
`
      },
      {
        path: 'db/schema.sql',
        content: `CREATE TABLE users (
    id INT PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL
);
CREATE TABLE sessions (
    id VARCHAR(255) PRIMARY KEY,
    user_id INT REFERENCES users(id),
    expires_at TIMESTAMP
);
`
      },
      {
        path: 'auth-service/index.ts',
        content: `import express from 'express';
import { Client } from 'pg';

const app = express();
const client = new Client(process.env.DATABASE_URL);

app.post('/login', async (req, res) => {
    // Authenticate user and issue session token
    const user = await client.query('SELECT * FROM users WHERE email = $1', [req.body.email]);
    res.json({ token: 'mock-session-token' });
});

app.listen(3000, () => console.log('Auth service listening on port 3000'));
`
      },
      {
        path: 'orders-service/main.py',
        content: `from fastapi import FastAPI
import aiokafka

app = FastAPI()

@app.post("/orders")
async def create_order(order: dict):
    # Process order and produce event to Kafka topic
    producer = aiokafka.AIOKafkaProducer(bootstrap_servers='kafka:9092')
    await producer.start()
    await producer.send_and_wait("order_created", b"New order data")
    return {"status": "created", "order_id": 123}
`
      }
    ]
  },
  {
    id: 'fintech',
    name: 'FinTech Payment Gateway',
    description: 'PCI-compliant ledger system, transaction process API, and external payment integration.',
    files: [
      {
        path: 'docker-compose.yml',
        content: `version: '3.8'
services:
  payment-api:
    build: ./payment-api
    ports:
      - "8080:8080"
    depends_on:
      - ledger-db
      - redis-cache
  ledger-db:
    image: postgres:14
    ports:
      - "5432:5432"
  redis-cache:
    image: redis:6.2-alpine
    ports:
      - "6379:6379"
`
      },
      {
        path: 'ledger-db/schema.sql',
        content: `CREATE TABLE accounts (
    id INT PRIMARY KEY,
    owner_name VARCHAR(100) NOT NULL,
    balance DECIMAL(15, 2) NOT NULL DEFAULT 0.00
);
CREATE TABLE transactions (
    id VARCHAR(50) PRIMARY KEY,
    source_account INT REFERENCES accounts(id),
    target_account INT REFERENCES accounts(id),
    amount DECIMAL(15, 2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
`
      },
      {
        path: 'payment-api/processor.ts',
        content: `import express from 'express';
import Redis from 'ioredis';
import { Client } from 'pg';

const app = express();
const cache = new Redis('redis://redis-cache:6379');
const db = new Client();

app.post('/pay', async (req, res) => {
    // Process transaction securely with cache-locked transfer keys
    const lockKey = \`lock:tx:\${req.body.transactionId}\`;
    const lock = await cache.set(lockKey, 'locked', 'EX', 10, 'NX');
    if (!lock) return res.status(409).send('Duplicate Request');
    
    // Transfer funds safely inside a SQL transaction
    await db.query('BEGIN');
    await db.query('UPDATE accounts SET balance = balance - $1 WHERE id = $2', [req.body.amount, req.body.from]);
    await db.query('UPDATE accounts SET balance = balance + $1 WHERE id = $2', [req.body.amount, req.body.to]);
    await db.query('COMMIT');
    
    res.send({ status: 'completed' });
});
`
      }
    ]
  },
  {
    id: 'analytics',
    name: 'AI Analytics Platform',
    description: 'PyTorch inference server, stream analytics worker, and customer usage dashboard.',
    files: [
      {
        path: 'docker-compose.yml',
        content: `version: '3.8'
services:
  pipeline:
    build: ./pipeline
    depends_on:
      - queue
  inference:
    build: ./inference
    ports:
      - "9000:9000"
  queue:
    image: rabbitmq:3-management
    ports:
      - "5672:5672"
      - "15672:15672"
`
      },
      {
        path: 'pipeline/worker.py',
        content: `import pika
import requests

connection = pika.BlockingConnection(pika.ConnectionParameters('queue'))
channel = connection.channel()

def callback(ch, method, properties, body):
    # Send pipeline data to PyTorch inference service
    response = requests.post("http://inference:9000/predict", json={"data": body.decode()})
    print("Inference result:", response.json())

channel.basic_consume(queue='data_queue', on_message_callback=callback, auto_ack=True)
channel.start_consuming()
`
      },
      {
        path: 'inference/server.py',
        content: `from fastapi import FastAPI
import torch

app = FastAPI()
model = torch.load("model.pt")

@app.post("/predict")
def predict(payload: dict):
    # Predict based on PyTorch model weights
    tensor = torch.tensor(payload["data"])
    output = model(tensor)
    return {"prediction": output.tolist()}
`
      }
    ]
  }
];

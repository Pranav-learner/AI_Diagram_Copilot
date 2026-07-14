/**
 * Sample sources for the Reverse Engineering test suite — small but representative
 * files across the supported languages/formats.
 */

export const TS_SERVICE = `import { Injectable } from '@nestjs/common';
import { UserRepository } from './user.repository';

@Injectable()
export class UserService extends BaseService implements IUserService {
  constructor(private repo: UserRepository) {}

  async getUser(id: string): Promise<User> {
    return this.repo.findById(id);
  }
}

@Controller('/users')
export class UserController {
  @Get('/:id')
  getUser() {
    return userService.getUser();
  }
}

export function helper() {
  return format(value);
}
`;

export const TS_EXPRESS = `import express from 'express';
const app = express();
app.get('/health', (req, res) => res.send('ok'));
app.post('/users', createUser);
`;

export const PY_SERVICE = `from fastapi import FastAPI
from .models import User

app = FastAPI()

class UserService(BaseService):
    async def get_user(self, id):
        return self.repo.find(id)

@app.get("/users/{id}")
def read_user(id):
    return {}
`;

export const GO_SERVICE = `package user

import (
    "context"
    "example.com/db"
)

type User struct {
    ID   string
    Name string
}

type Service struct {
    Repo db.Repository
}

func (s *Service) GetUser(ctx context.Context, id string) (*User, error) {
    return nil, nil
}

func NewService() *Service {
    return &Service{}
}
`;

export const JAVA_SERVICE = `package com.acme.user;

import com.acme.base.BaseService;

@Service
public class UserService extends BaseService implements IUserService {
    public User getUser(String id) {
        return repo.find(id);
    }
}

@RestController
public class UserController {
    @GetMapping("/users")
    public List<User> list() {
        return null;
    }
}
`;

export const SQL_SCHEMA = `CREATE TABLE users (
  id INT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  org_id INT REFERENCES organizations(id)
);

CREATE TABLE organizations (
  id INT PRIMARY KEY,
  name VARCHAR(100)
);

CREATE VIEW active_users AS SELECT * FROM users;
`;

export const COMPOSE = `version: "3.8"
services:
  web:
    image: nginx:alpine
    ports:
      - "80:80"
    depends_on:
      - api
  api:
    build: ./api
    environment:
      - DATABASE_URL=postgres://db
    depends_on:
      - db
      - cache
  db:
    image: postgres:15
  cache:
    image: redis:7
`;

export const K8S = `apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
spec:
  replicas: 3
  template:
    spec:
      containers:
        - name: web
          image: myrepo/web:1.0
---
apiVersion: v1
kind: Service
metadata:
  name: web
spec:
  selector:
    app: web
  ports:
    - port: 80
`;

export const TERRAFORM = `resource "aws_db_instance" "main" {
  engine = "postgres"
}

resource "aws_elasticache_cluster" "cache" {
  engine = "redis"
}

resource "aws_ecs_service" "api" {
  cluster = aws_db_instance.main.id
}
`;

export const OPENAPI = `openapi: 3.0.0
info:
  title: Pet API
  version: 1.0.0
paths:
  /pets:
    get:
      operationId: listPets
      tags:
        - pets
      responses:
        "200":
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/Pet"
    post:
      operationId: createPet
components:
  schemas:
    Pet:
      type: object
      properties:
        id:
          type: integer
        name:
          type: string
`;

export const GRAPHQL = `type User {
  id: ID!
  name: String!
  posts: [Post!]!
}

type Post {
  id: ID!
  author: User!
}

type Query {
  user(id: ID!): User
  posts: [Post!]!
}
`;

export const DOCKERFILE = `FROM node:20-alpine
WORKDIR /app
COPY . .
RUN npm ci
ENV PORT=3000
EXPOSE 3000
CMD ["node", "index.js"]
`;

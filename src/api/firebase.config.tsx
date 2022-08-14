import { initializeApp } from "firebase/app";
import { initializeFirestore } from "firebase/firestore";
import * as firebaseConfig from "../config/firebase.client.json"

const app = initializeApp(firebaseConfig);

export const db = initializeFirestore(app, {host: 'localhost:8080', ssl: false})

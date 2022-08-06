import { db } from "./firebase.config";
import  * as firestore from '@firebase/firestore'
import {connectFirestoreEmulator} from 'firebase/firestore';

connectFirestoreEmulator(db, 'localhost', 8080)

const NOTES_COLLECTION = "sample_data";

export const getNotesRef = () => {
  return   firestore.collection(db, NOTES_COLLECTION)
};

export const sleep = (time = 0) => {
  return new Promise((success) => {
    setTimeout(success, time)
  })
}

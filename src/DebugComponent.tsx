import React, { useCallback } from "react";
import { fetchDocs, fetchDocsGradually } from "./api";
import {fetchDocsByWC} from './api/fetchDocByWC';

export const DebugComponent: React.FC = () => {
  const [count, setCount] = React.useState<string | number>(0);
  const [started, setStarted] = React.useState(false);
  const [done, setDone] = React.useState(false);

  const startOnfetchDocsByWCNoLongPolling = useCallback(async (maxCount: number) => {
    console.log('starting');
    setStarted(true);
    await fetchDocsByWC(maxCount, false, setCount);
    setDone(true);
  }, []);

  const startOnfetchDocsByWCWithLongPolling = useCallback(async (maxCount: number) => {
    console.log('starting');
    setStarted(true);
    await fetchDocsByWC(maxCount, true, setCount);
    setDone(true);
  }, []);

  const reset = () => {
    setStarted(false);
    setDone(false);
    setCount(0);
  };

  return (
    <div>
      {started ? null : (
          <>
            <h4>No longpolling: Grab documents by webchannel (repeat 10 times)</h4>

            <ul
                style={{
                  listStyle: "none",
                  display: "flex",
                  flexDirection: "column",
                }}
            >
              {[100, 200, 300, 400, 500].map((maxCount) => {
                return (
                    <li key={maxCount}>
                      <button onClick={() => startOnfetchDocsByWCNoLongPolling(maxCount)}>
                        click to load {maxCount} documents
                      </button>
                    </li>
                );
              })}
            </ul>
          </>
      )}

      {started ? null : (
          <>
            <h4>Force longpolling: Grab documents by webchannel (repeat 10 times)</h4>

            <ul
                style={{
                  listStyle: "none",
                  display: "flex",
                  flexDirection: "column",
                }}
            >
              {[100, 200, 300, 400, 500].map((maxCount) => {
                return (
                    <li key={maxCount}>
                      <button onClick={() => startOnfetchDocsByWCWithLongPolling(maxCount)}>
                        click to load {maxCount} documents
                      </button>
                    </li>
                );
              })}
            </ul>
          </>
      )}

      {started ? <p>loaded documents: {count}</p> : null}

      {done && <h1>Finished!</h1>}
      {done && <button onClick={reset}>reset</button>}
    </div>
  );
};

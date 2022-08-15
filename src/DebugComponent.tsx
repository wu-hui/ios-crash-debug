import React, { useCallback } from "react";
import { fetchDocs, fetchDocsGradually } from "./api";
import {fetchDocsByWC} from './api/fetchDocByWC';

export const DebugComponent: React.FC = () => {
  const [count, setCount] = React.useState<string | number>(0);
  const [started, setStarted] = React.useState(false);
  const [done, setDone] = React.useState(false);

  const startOnfetchDocs = useCallback(async (maxCount: number) => {
    setStarted(true);
    await fetchDocs(maxCount, setCount);
    setDone(true);
  }, []);

  const startOnfetchDocsByWC = useCallback(async (maxCount: number) => {
    console.log('starting');
    setStarted(true);
    await fetchDocsByWC(maxCount, setCount);
    setDone(true);
  }, []);

  const startOnfetchDocsGradually = useCallback(async (maxCount: number) => {
    setStarted(true);
    await fetchDocsGradually(maxCount, setCount);
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
            <h4>Grab documents by webchannel by number</h4>

            <ul
                style={{
                  listStyle: "none",
                  display: "flex",
                  flexDirection: "column",
                }}
            >
              {[100, 500, 1000, 2000, 5000].map((maxCount) => {
                return (
                    <li key={maxCount}>
                      <button onClick={() => startOnfetchDocsByWC(maxCount)}>
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

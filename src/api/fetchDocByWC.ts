import {WebChannelConnection} from './webchannel_connection';

type ListenReq = {
  database: string,
  addTarget: {
    query: {
      structuredQuery: unknown
      parent: string
    }
    targetId: number
  }
}

const templateReq: ListenReq = {
  database: "projects/ios-crash-debug/databases/(default)",
  addTarget:
      {
        query:
            {
              structuredQuery:
                  {
                    from: [{collectionId: "sample_data"}],
                    orderBy: [{
                      field: {fieldPath: "updated_at"},
                      direction: "ASCENDING"
                    },
                      {
                        field: {fieldPath: "__name__"},
                        direction: "ASCENDING"
                      }],
                    limit: 100
                  },
              parent: "projects/ios-crash-debug/databases/(default)/documents"
            },
        targetId: 2
      }
}

export const fetchDocsByWC = async (
    maxCount: number,
    onLoadingPage: (count: number) => void
) => {
  let repeat = 10;
  const conn = new WebChannelConnection();
  const stream = conn.openStream<ListenReq, unknown>('Listen');
  let req = {...templateReq};
  // @ts-ignore
  req.addTarget.query.structuredQuery.limit = maxCount;
  console.log(`Sending ${req} with remaining repeat ${repeat}`);
  stream.send(req);
  stream.onMessage(msg => {
    // @ts-ignore
    if(msg.targetChange && !msg.targetChange.targetChangeType) {
      console.log(`Received global snapshot`);
      if(repeat > 0) {
        const newReq = {...req};
        newReq.addTarget.targetId = req.addTarget.targetId + 1;
        console.log(`Sending ${newReq} with remaining repeat ${repeat}`);
        stream.send(newReq);

        req = newReq;
        repeat--;
      }
    }
  })
}

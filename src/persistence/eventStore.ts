import * as esClient from 'node-eventstore-client'
import { HeartbeatInfo, TcpEndPoint } from 'node-eventstore-client'
import * as uuid from 'uuid'
import {
  MessageEvent,
  MESSAGE_RECEIVED,
  MessageReceived,
} from '../events/Events'
import { State } from '../model/State'
import { PUBLIC_CHANNEL_ID } from '../model/Channel'
import { reduceServiceState, initialState } from '../logic/StateUpdater'
import { authorizeEvent } from '../logic/EventAuthorizer'
import { ReplaySubject } from 'rxjs'

const serviceEventStream = 'messageService'
const messageChannelStream = (channelName: string) =>
  `messageService/channel/${channelName}`

const host = 'localhost'
const tcpPort = '1113'
const httpPort = '2113'

const credentials = new esClient.UserCredentials('admin', 'changeit')
const esConnection = esClient.createConnection(
  {
    defaultUserCredentials: credentials,
  },
  `tcp://${host}:${tcpPort}`
)

export const createChannelSubscription = async (channelName: string) =>
  (await createStreamSubscription(
    messageChannelStream(channelName)
  )) as ReplaySubject<MessageReceived>

export const createStreamSubscription = async (
  streamName: string,
  messageSubject: ReplaySubject<MessageEvent> = new ReplaySubject<MessageEvent>(
    500
  )
) => {
  const connection = await initEventStoreConnection()

  const storeSubscription = await connection.subscribeToStreamFrom(
    streamName,
    0,
    false,
    (subscription, event) => {
      if (
        event.originalEvent !== undefined &&
        event.originalEvent.data !== undefined
      ) {
        const parsedEvent = JSON.parse(
          event.originalEvent.data.toString()
        ) as MessageEvent
        messageSubject.next(parsedEvent)
      }
    }
  )

  messageSubject.subscribe(undefined, undefined, () => {
    storeSubscription.stop()
  })

  return messageSubject
}

esConnection.on('connected', tcpEndPoint => {
  if (tcpEndPoint instanceof Error) {
    console.error('got error instead of endpoint object', tcpEndPoint)
  } else if (typeof tcpEndPoint === 'string') {
    console.error('got string instead of endpoint object', tcpEndPoint)
  } else {
    if ((tcpEndPoint as TcpEndPoint).host) {
      console.log(
        `Connected to eventstore at ${(tcpEndPoint as TcpEndPoint)
          .host}:${(tcpEndPoint as TcpEndPoint).port}`
      )
    } else {
      const endpoint = (tcpEndPoint as HeartbeatInfo).remoteEndPoint

      console.log(
        `Connected to eventstore at ${endpoint.host}:${endpoint.port}`
      )
    }
  }
})

const connected = esConnection.connect()

export async function initEventStoreConnection() {
  await connected
  return esConnection
}

export async function dispatchServiceEvent(
  event: MessageEvent,
  channelName: string = PUBLIC_CHANNEL_ID
) {
  console.log('dispatching service event')
  const eventId = uuid.v4()
  const storeEvent = esClient.createJsonEventData(
    eventId,
    event,
    null,
    event.type
  )
  console.log('Appending...')

  await serviceState
    .take(1)
    .map(state => authorizeEvent(state)(event))
    .flatMap(valid => {
      if (valid) {
        let streamName = serviceEventStream
        switch (event.type) {
          case MESSAGE_RECEIVED:
            streamName = messageChannelStream(channelName)
            break
        }
        return esConnection
          .appendToStream(streamName, esClient.expectedVersion.any, storeEvent)
          .then(result => {
            console.log('Stored event:', eventId)
            console.log(
              `Look for it at: http://${host}:${httpPort}/web/index.html#/streams/${serviceEventStream}`
            )
          })
          .catch(err => {
            console.error(err)
          })
      }
      throw new Error('Invalid Event')
    })
    .toPromise()
    .catch((error: Error) => console.error(error))
}

export const serviceState = new ReplaySubject<State>(1)
serviceState.next(initialState)

const initStateSubscription = async () => {
  const eventStream = await createStreamSubscription(serviceEventStream)

  eventStream
    .withLatestFrom(serviceState, (event, state) => {
      return { state, event }
    })
    .subscribe(async ({ state, event }) => {
      const nextState = await reduceServiceState(state, event)
      serviceState.next(nextState)
    })
}
initStateSubscription()

import {
  ServiceEvent,
  USER_LOGGED_OUT,
  USER_LOGGED_IN,
  SERVICE_STARTED,
  CHANNEL_CREATED,
} from '../events/Events'
import { State, UserConnection } from '../model/State'
import { PUBLIC_CHANNEL_ID, Channel } from '../model/Channel'
import { DisplayUser } from '../model/User'
import { createChannelSubscription } from '../persistence/eventStore'

export const initialState: State = Object.freeze({
  connections: [],
  users: [],
  channels: [],
})

const reduceConnections = (
  connections: UserConnection[] = [],
  event: ServiceEvent
) => {
  switch (event.type) {
    case SERVICE_STARTED:
      return connections.map(con => ({ ...con, connectionCount: 0 }))
    case USER_LOGGED_IN:
      if (connections.some(con => con.userId === event.userId)) {
        return connections.map(con => {
          if (con.userId === event.userId) {
            return {
              ...con,
              connectionCount: con.connectionCount + 1,
            }
          } else {
            return con
          }
        })
      } else {
        return connections.concat([
          {
            connectionCount: 1,
            userId: event.userId,
          },
        ])
      }
    case USER_LOGGED_OUT:
      return connections.map(con => {
        if (con.userId === event.userId) {
          return {
            ...con,
            connectionCount: Math.max(con.connectionCount - 1, 0),
          }
        } else {
          return con
        }
      })
    default:
      return connections
  }
}

const reduceUsers = (nextConnections: UserConnection[]) => (
  users: DisplayUser[] = [],
  event: ServiceEvent
) => {
  switch (event.type) {
    case SERVICE_STARTED:
      return users.map(u => ({ ...u, online: false }))
    case USER_LOGGED_IN:
      if (users.some(u => u.userId === event.userId)) {
        return users.map(
          u =>
            u.userId === event.userId
              ? {
                  userId: u.userId,
                  online: true,
                  displayName: event.displayName,
                  profilePicture: event.profilePicture,
                }
              : u
        )
      } else {
        return users.concat({
          userId: event.userId,
          displayName: event.displayName,
          profilePicture: event.profilePicture,
          online: true,
        })
      }
    case USER_LOGGED_OUT:
      if (
        nextConnections.some(
          con => con.userId === event.userId && con.connectionCount === 0
        )
      ) {
        return users.map(
          u => (u.userId === event.userId ? { ...u, online: false } : u)
        )
      }
    default:
      return users
  }
}

const reduceChannels = (
  channels: Channel[] = [],
  event: ServiceEvent
): Channel[] => {
  switch (event.type) {
    case SERVICE_STARTED:
      if (!channels.some(ch => ch.channelId === PUBLIC_CHANNEL_ID)) {
        return [
          ...channels,
          {
            channelId: PUBLIC_CHANNEL_ID,
            userIds: [],
            messages: createChannelSubscription(PUBLIC_CHANNEL_ID),
          },
        ]
      } else {
        return channels
      }
    case CHANNEL_CREATED: {
      return [
        ...channels,
        {
          channelId: event.channelId,
          userIds: event.userIds,
          messages: createChannelSubscription(event.channelId),
        },
      ]
    }
    default:
      return channels
  }
}

export const reduceServiceState = (
  state: State = initialState,
  event: ServiceEvent
): State => {
  const connections = reduceConnections(state.connections, event)

  return {
    connections,
    channels: reduceChannels(state.channels, event),
    users: reduceUsers(connections)(state.users, event),
  }
}

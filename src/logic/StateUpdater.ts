import {
  ServiceEvent,
  USER_LOGGED_OUT,
  USER_LOGGED_IN,
  SERVICE_STARTED,
} from '../events/Events'
import { State, UserConnection } from '../model/State'
import { PUBLIC_CHANNEL_ID, ActiveChannel, Channel } from '../model/Channel'
import { DisplayUser } from '../model/User'
import { createChannelSubscription } from '../persistence/eventStore'

export const initialState: State = Object.freeze({
  connections: [],
  users: [],
  activeChannels: [],
  inactiveChannels: [
    {
      channelId: PUBLIC_CHANNEL_ID,
      userIds: [],
    },
  ],
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
      if (users.some(u => u.userId === event.userId && !u.online)) {
        return users.map(
          u => (u.userId === event.userId ? { ...u, online: true } : u)
        )
      } else if (users.every(u => u.userId !== event.userId)) {
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

const reduceActiveChannels = (
  nextConnections: UserConnection[],
  inactiveChannels: Channel[]
) => async (activeChannels: ActiveChannel[] = [], event: ServiceEvent) => {
  switch (event.type) {
    case USER_LOGGED_IN:
      const newActiveChannels = await Promise.all(
        inactiveChannels
          .filter(
            ch =>
              ch.userIds.some(id => id === event.userId) ||
              ch.channelId === PUBLIC_CHANNEL_ID
          )
          .map(async ch => ({
            ...ch,
            messages: await createChannelSubscription(ch.channelId),
          }))
      )
      return activeChannels.concat(newActiveChannels)
    case USER_LOGGED_OUT:
      return activeChannels.filter(ch => {
        const keep =
          ch.userIds.some(id =>
            nextConnections.some(con => con.userId === id)
          ) || ch.channelId === PUBLIC_CHANNEL_ID

        return keep
      })

    default:
      return activeChannels
  }
}

const reduceInactiveChannels = (
  nextConnections: UserConnection[],
  activeChannels: ActiveChannel[]
) => (inactiveChannels: Channel[] = [], event: ServiceEvent) => {
  switch (event.type) {
    case USER_LOGGED_IN:
      return inactiveChannels.filter(
        ch =>
          ch.userIds.every(id => id !== event.userId) &&
          ch.channelId !== PUBLIC_CHANNEL_ID
      )
    case USER_LOGGED_OUT:
      const newInactiveChannels = activeChannels.filter(
        ch =>
          ch.userIds.every(id =>
            nextConnections.every(con => con.userId !== id)
          ) && ch.channelId !== PUBLIC_CHANNEL_ID
      )
      return inactiveChannels.concat(newInactiveChannels)
    default:
      return inactiveChannels
  }
}

export const reduceServiceState = async (
  state: State = initialState,
  event: ServiceEvent
): Promise<State> => {
  const connections = reduceConnections(state.connections, event)
  const activeChannels = await reduceActiveChannels(
    connections,
    state.inactiveChannels
  )(state.activeChannels, event)
  return {
    connections,
    activeChannels,
    inactiveChannels: reduceInactiveChannels(connections, state.activeChannels)(
      state.inactiveChannels,
      event
    ),
    users: reduceUsers(connections)(state.users, event),
  }
}

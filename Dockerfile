FROM node:8-alpine

# Create app directory
RUN mkdir -p /usr/src/messages
WORKDIR /usr/src/messages

# Install app dependencies
COPY ./package.json /usr/src/messages/
COPY ./package-lock.json /usr/src/messages/
RUN npm install

# Bundle app source
COPY . /usr/src/messages

EXPOSE 3000

CMD [ "npm", "start" ]

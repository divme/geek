const net = require('net');
const parse = require('./core/parse');

class Request {
  // method, url = host + port + path
  // headers
  // Content-Type
  // Content-Type: application/x-www-form-urlencoded
  // Content-Type: application/json
  // Content-Type: multipart/form-data
  // Content-Type: text/xml
  // Content-Length
  // body: k-v

  constructor(options) {
    this.method = options.method || "GET"
    this.host = options.host
    this.port = options.port || 80
    this.path = options.path || "/"
    this.body = options.body || {}
    this.headers = options.headers || {}
    if (!this.headers["Content-Type"]) {
      this.headers["Content-Type"] = "application/x-www-form-urlencoded"
    }

    if (this.headers["Content-Type"] === "application/json") {
      this.bodyText = JSON.stringify(this.body)
    } else if (this.headers["Content-Type"] === "application/x-www-form-urlencoded") {
      this.bodyText = Object.keys(this.body).map(key => `${key}=${encodeURIComponent(this.body[key])}`).join('&')
    }

    // calculate Content-Length
    this.headers["Content-Length"] = this.bodyText.length

  }

  toString() {
    return `${this.method} ${this.path} HTTP/1.1\r\nHOST: ${this.host}\r\n${Object.keys(this.headers).map(key => `${key}: ${this.headers[key]}`).join('\r\n')}\r\n\r\n${this.bodyText}\r\n`
  }

  send(connection) {
    return new Promise((resolve, reject) => {
      const parse = new ResponseParser;
      if (connection) {
        connection.write(this.toString())
      } else {
        connection = net.createConnection({
          host: this.host,
          port: this.port,
        }, () => {
          connection.write(this.toString())
        })
      }
      connection.on('data', (data) => {
        parse.receive(data.toString());
        if (parse.isFinished) {
          resolve(parse.response);
        }
        connection.end();
      });
      connection.on('error', (err) => {
        reject(err);
        connection.end();
      });
    })
  }
}

class Response {

}

class ResponseParser {
  constructor() {
    this.WAITING_STATUS_LINE = 0;
    this.WAITING_STATUS_LINE_END = 1;
    this.WAITING_HEADER_NAME = 2;
    this.WAITING_HEADER_SPACE = 3;
    this.WAITING_HEADER_VALUE = 4;
    this.WAITING_HEADER_LINE_END = 5;
    this.WAITING_HEADER_BLOCK_END = 6;
    this.WAITING_BODY = 7;

    this.current = this.WAITING_STATUS_LINE;
    this.statusLine = "";
    this.headers = {};
    this.headerName = "";
    this.headerValue = "";
    this.bodyParse = null;
  }

  get isFinished() {
    return this.bodyParse && this.bodyParse.isFinished
  }

  get response() {
    this.statusLine.match(/HTTP\/1.1 ([0-9]+) ([\s\S]+)/)
    return {
      statusCode: RegExp.$1,
      statusTex: RegExp.$2,
      headers: this.headers,
      body: this.bodyParse.content.join('')
    }
  }
  // 字符流处理
  receive(string) {
    for (let i = 0; i < string.length; i++) {
      this.receiveChar(string.charAt(i));
    }
  }
  receiveChar(char) {
    if (this.current === this.WAITING_STATUS_LINE) {
      if (char === '\r') {
        this.current = this.WAITING_STATUS_LINE_END
      } else {
        this.statusLine += char
      }
    }

    else if (this.current === this.WAITING_STATUS_LINE_END) {
      if (char === '\n') {
        this.current = this.WAITING_HEADER_NAME
      }
    }

    else if (this.current === this.WAITING_HEADER_NAME) {
      if (char === ':') {
        this.current = this.WAITING_HEADER_SPACE
      } else if (char === '\r') {
        this.current = this.WAITING_HEADER_BLOCK_END
        if (this.headers['Transfer-Encoding'] === 'chunked')
          this.bodyParse = new TrunkedBodyParser();
      } else {
        this.headerName += char
      }
    }

    else if (this.current === this.WAITING_HEADER_SPACE) {
      if (char === ' ') {
        this.current = this.WAITING_HEADER_VALUE
      }
    }

    else if (this.current === this.WAITING_HEADER_VALUE) {
      if (char === '\r') {
        this.current = this.WAITING_HEADER_LINE_END
        this.headers[this.headerName] = this.headerValue
        this.headerName = ""
        this.headerValue = ""
      } else {
        this.headerValue += char
      }
    }

    else if (this.current === this.WAITING_HEADER_LINE_END) {
      if (char === '\n') {
        this.current = this.WAITING_HEADER_NAME
      }
    }

    else if (this.current === this.WAITING_HEADER_BLOCK_END) {
      if (char === '\n') {
        this.current = this.WAITING_BODY
      }
    }

    else if (this.current === this.WAITING_BODY) {
      this.bodyParse.receiveChar(char)
    }
  }
}


class TrunkedBodyParser {
  constructor() {
    this.WAITING_LENGTH = 0;
    this.WAITING_LENGTH_LINE_END = 1;
    this.READING_TRUNK = 2;
    this.WAITING_NEW_LINE = 3;
    this.WAITING_NEW_LINE_END = 4;
    this.FINISHED_NEW_LINE = 5;
    this.FINISHED_NEW_LINE_END = 6;
    this.isFinished = false;
    this.length = 0;
    this.content = [];
    this.current = this.WAITING_LENGTH;
  }
  // 字符流处理
  receiveChar(char) {
    if (this.current === this.WAITING_LENGTH) {
      if (char === '\r') {
        if (this.length === 0) {
          this.current = this.FINISHED_NEW_LINE
        } else {
          this.current = this.WAITING_LENGTH_LINE_END
        }
      } else {
        this.length *= 10
        this.length += char.charCodeAt(0) - '0'.charCodeAt(0)
      }
    }

    else if (this.current === this.WAITING_LENGTH_LINE_END) {
      if (char === '\n') {
        this.current = this.READING_TRUNK
      }
    }

    else if (this.current === this.READING_TRUNK) {
      this.content.push(char)
      this.length --
      if (this.length === 0) {
        this.current = this.WAITING_NEW_LINE
      }
    }

    else if (this.current === this.WAITING_NEW_LINE) {
      if (char === '\r') {
        this.current = this.WAITING_NEW_LINE_END
      }
    }

    else if (this.current === this.WAITING_NEW_LINE_END) {
      if (char === '\n') {
        this.current = this.WAITING_LENGTH
      }
    }

    else if (this.current === this.FINISHED_NEW_LINE) {
      if (char === '\r') {
        this.current = this.FINISHED_NEW_LINE_END
      }
    }

    else if (this.current === this.FINISHED_NEW_LINE_END) {
      if (char === '\n') {
        this.isFinished = true
      }
    }
  }
}

void async function () {
  const options = {
    method: "POST",
    path: "/",
    host: "127.0.0.1",
    port: 6066,
    headers: {
      ["X-Foo2"]: "customed"
    },
    body: {
      name: "elle"
    }
  }

  let request = new Request(options)

  let response = await request.send();
  console.log('response', response);

  let dom = parse.parseHTML(response.body);


  console.log(response)
}()

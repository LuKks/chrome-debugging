const CDP = require('chrome-remote-interface')
const mutexify = require('mutexify/promise.js')

module.exports = class ChromeDebuggingProtocol {
  constructor (opts = {}) {
    if (!opts.port) throw new Error('Port is required')

    this._lock = mutexify()
    this.port = opts.port
    this.clients = {}
  }

  get options () {
    return { port: this.port }
  }

  async list ({ ignoreProtocols = [] } = {}) {
    const targets = await CDP.List(this.options)

    return targets.filter(target => {
      const proto = new URL(target.url).protocol.slice(0, -1)
      return ignoreProtocols.indexOf(proto) === -1
    })
  }

  async connect (targetId) {
    const release = await this._lock()

    await this._keepAlive(targetId)

    try {
      if (this.clients[targetId]) {
        return this.clients[targetId]
      }

      const client = await CDP({ target: targetId, ...this.options })

      await client.DOM.enable()
      await client.CSS.enable()
      await client.Page.enable()
      await client.Network.enable()

      this.clients[targetId] = client

      return client
    } finally {
      release()
    }
  }

  async close (targetId) {
    return this.clients[targetId].close()
  }

  async destroy () {
    for (const targetId in this.clients) {
      await this.close(targetId)
    }
  }

  async _keepAlive (targetId) {
    const client = this.clients[targetId]
    if (!client) return

    try {
      await client.DOM.getDocument()
    } catch (error) {
      await this.close(targetId)
      delete this.clients[targetId]
    }
  }
}

class Target {

}

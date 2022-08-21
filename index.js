const CDP = require('chrome-remote-interface')
const mutexify = require('mutexify/promise.js')

module.exports = class ChromeDebuggingProtocol {
  constructor (opts = {}) {
    if (!opts.port) throw new Error('Port is required')

    this._lock = mutexify()
    this.port = opts.port
    this.connected = {}
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

  async use (targetId) {
    const release = await this._lock()

    await this._keepAlive(targetId)

    try {
      if (this.connected[targetId]) {
        return this.connected[targetId]
      }

      const target = new Target(this.port, targetId)
      await target.ready()

      this.connected[targetId] = target

      return target
    } finally {
      release()
    }
  }

  async close (targetId) {
    if (!this.connected[targetId]) return

    await this.connected[targetId].close()
    delete this.connected[targetId]
  }

  async destroy () {
    for (const targetId in this.connected) {
      await this.close(targetId)
    }
  }

  async _keepAlive (targetId) {
    const target = this.connected[targetId]
    if (!target) return

    try {
      await target.DOM.getDocument()
    } catch {
      await this.close(targetId)
    }
  }
}

class Target {
  constructor (chromePort, targetId, opts = {}) {
    this.client = null
    this.options = opts // + should use it for automatic enable/disable DOM, CSS, etc

    this._connect = CDP({ port: chromePort, target: targetId })
    this._ready = this.ready()
  }

  async ready () {
    if (this._ready) return this._ready

    this.client = await this._connect
    this._clone()

    await this.DOM.enable()
    await this.CSS.enable()
    await this.Page.enable()
    await this.Network.enable()

    this.document = await this.DOM.getDocument()
  }

  async $ (selector) {
    const nodeId = this.document.root.nodeId
    const nodes = await this.DOM.querySelectorAll({ selector, nodeId })
    return (nodes || {}).nodeIds || []
  }

  async frames () {
    const { frameTree } = await this.Page.getFrameTree()
    const { frame, childFrames = [] } = frameTree
    return [frame, ...childFrames.map(({ frame }) => frame)]
  }

  async evaluate (expression, opts = {}) {
    if (typeof expression === 'object') return this.evaluate(undefined, expression)
    if (expression) opts.expression = expression
    return this.Runtime.evaluate(opts)
  }

  async getAttributes (nodeId, key) {
    const { attributes = [] } = await this.DOM.getAttributes({ nodeId })
    if (key === undefined) return attributes
    return getAttribute(attributes, key)
  }

  _clone () {
    for (const key in this.client) {
      // DOM, CSS, Page, etc
      if (key[0] === key[0].toUpperCase() && !key.includes('.')) {
        this[key] = this.client[key]
      }
    }

    this.alterPath = this.client.alterPath
  }

  get host () { return this.client.host } // localhost
  get port () { return this.client.port } // 41003
  get secure () { return this.client.secure } // false
  get useHostName () { return this.client.useHostName } // false
  get local () { return this.client.local } // false
  get target () { return this.client.target } // ABA5B7CFE72FABAE16EAC42863E470E2
  get webSocketUrl () { return this.client.webSocketUrl } // ws://127.0.0.1:41003/devtools/page/ABA5B7CFE72FABAE16EAC42863E470E2
}

function getAttribute (attributes, key) {
  const index = attributes.indexOf(key)
  if (index === -1) return null
  return attributes[index + 1]
}

// + should correctly parse all attrs and return them, like http headers

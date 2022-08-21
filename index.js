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

      this.clients[targetId] = extendClient(client)

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

function extendClient (client) {
  const { Page, DOM } = client

  client.document = await DOM.getDocument()

  client.$ = async function (selector) {
    const nodes = await DOM.querySelectorAll({ nodeId: client.document.root.nodeId, selector })
    return (nodes || {}).nodeIds || []
  }

  client.frames = async function () {
    const { frameTree } = await Page.getFrameTree()
    const { frame, childFrames = [] } = frameTree
    return [frame, ...childFrames.map(({ frame }) => frame)]
  }

  client.evaluate = async function (expression, opts = {}) {
    if (typeof expression === 'object') [opts, expression] = [expression, undefined]
    if (expression) opts.expression = expression
    return tab.send('Runtime.evaluate', opts)
  }

  client.getAttributes = async function (nodeId, key) {
    const { attributes = [] } = await DOM.getAttributes({ nodeId })
    if (key === undefined) return attributes
    return getAttribute(attributes, key)
  }

  return client
}

function getAttribute (attributes, key) {
  const index = attributes.indexOf(key)
  if (index === -1) return null
  return attributes[index + 1]
}

// + should correctly parse all attrs and return them, like http headers

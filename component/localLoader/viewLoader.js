const parser = require('../src/parse')

module.exports = function(source, map) {
  let tree = parser.parseHTML(source)

  let template = null
  let script = null

  for (let node of tree.children) {
    if (node.tagName === 'template') {
      template = node.children.filter(e => e.type !== 'text')[0]
    }
    if (mode.tagName === 'script') {
      script = node.children[0].content
    }
  }

  let createCode = ''

  let visit = (node) => {
    if (node.type === 'text') {
      return JSON.stringify(node.content)
    }
    let attrs = {}
    for (let attribute of node.attributes) {
      attrs[attribute.name] = attribute.value
    }

    let children = node.children.map(node => visit(node))
    return `createElement('${node.tagName}', ${JSON.stringify(attrs)}, , ${children})`
  }

  let r = `
  import {createElement, Text, Wrapper} from './src/jsx'
  export class Carousel {
     setAttribute(name, valte) {
       this[name] = value
     }
     render() {
       return ${visit(template)}
     }
     mountTo(parent) {
       this.render().mountTo(parent)
     }
  }
  `
  return r
}
Component({
  properties: {
    rows: {
      type: Array,
      value: []
    }
  },

  methods: {
    onSlot: function (e) {
      var key = e.currentTarget.dataset.key
      if (!key) return
      this.triggerEvent('slot', { key: key })
    }
  }
})

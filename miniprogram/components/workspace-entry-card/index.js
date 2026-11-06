Component({
  properties:{entry:{type:Object,value:{},observer:function(value) { this.setData({displayLogo:value.logo || value.fallbackLogo || ''}) }}},
  data:{displayLogo:''},
  methods:{
    openCard:function() { this.triggerEvent('open',{key:this.properties.entry.key,id:this.properties.entry.id}) },
    imageError:function() { var fallback=this.properties.entry.fallbackLogo || '';if(fallback && this.data.displayLogo!==fallback)this.setData({displayLogo:fallback}) }
  }
})

<template>
  <div class="commercial-editor">
    <div class="commercial-heading">
      <h2>商业合作</h2>
      <span>选填</span>
      <el-button link type="primary" @click="categoryDialogVisible=true">编辑类别</el-button>
    </div>
    <div class="commercial-grid">
      <el-form-item v-for="category in localCategories" :key="category.id" :label="category.name || '未命名类别'">
        <div class="partner-rows">
          <div v-for="(partner,index) in category.partners" :key="category.id+'-'+index">
            <el-input v-model="category.partners[index]" maxlength="120" />
            <el-button v-if="category.partners.length>1" link type="danger" @click="removePartner(category.id,index)">删除</el-button>
          </div>
          <el-button link type="primary" @click="addPartner(category.id)">＋ 增加{{ category.name || '单位' }}</el-button>
        </div>
      </el-form-item>
    </div>

    <el-dialog v-model="categoryDialogVisible" title="赞助类别" width="480px" append-to-body>
      <div class="category-list">
        <div v-for="category in localCategories" :key="category.id">
          <el-input v-model="category.name" maxlength="20" placeholder="类别名称" />
          <el-button v-if="!category.builtin" link type="danger" @click="removeCategory(category.id)">删除</el-button>
        </div>
        <el-button link type="primary" @click="addCategory">＋ 增加赞助类别</el-button>
      </div>
      <template #footer><el-button type="primary" @click="categoryDialogVisible=false">完成</el-button></template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'

const props=defineProps({modelValue:{type:Array,default:()=>[]}})
const emit=defineEmits(['update:modelValue'])
const categoryDialogVisible=ref(false)
const localCategories=ref([])
let syncing=false

function normalize(value){
  const rows=(Array.isArray(value)?value:[]).map((item,index)=>({
    id:String(item?.id||('category-'+index)),
    name:String(item?.name||''),
    builtin:item?.builtin===true,
    partners:(Array.isArray(item?.partners)?item.partners:[]).map(partner=>String(partner||''))
  }))
  rows.forEach(item=>{if(!item.partners.length)item.partners=['']})
  return rows.length?rows:[{id:'title',name:'冠名商',builtin:true,partners:['']},{id:'sponsor',name:'赞助商',builtin:true,partners:['']}]
}

watch(()=>props.modelValue,value=>{syncing=true;localCategories.value=normalize(value);queueMicrotask(()=>{syncing=false})},{immediate:true,deep:true})
watch(localCategories,value=>{if(!syncing)emit('update:modelValue',value.map(item=>({...item,partners:[...item.partners]})))},{deep:true})

function addPartner(id){const category=localCategories.value.find(item=>item.id===id);if(category)category.partners.push('')}
function removePartner(id,index){const category=localCategories.value.find(item=>item.id===id);if(!category)return;category.partners.splice(index,1);if(!category.partners.length)category.partners=['']}
function addCategory(){localCategories.value.push({id:'custom-'+Date.now()+'-'+Math.random().toString(36).slice(2,6),name:'',builtin:false,partners:['']})}
function removeCategory(id){localCategories.value=localCategories.value.filter(item=>item.id!==id)}
</script>

<style scoped>
.commercial-heading{display:flex;align-items:center;gap:9px}.commercial-heading h2{margin:0 0 18px}.commercial-heading>span{margin-bottom:18px;padding:2px 7px;border-radius:4px;color:#69766f;background:#f0f3f1;font-size:12px}.commercial-heading>.el-button{margin:0 0 18px auto}.commercial-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0 24px;max-width:740px}.partner-rows,.category-list{display:flex;width:100%;flex-direction:column;gap:8px}.partner-rows>div,.category-list>div{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:7px}.category-list>div{grid-template-columns:minmax(0,1fr) 52px}@media(max-width:720px){.commercial-grid{grid-template-columns:1fr}}
</style>

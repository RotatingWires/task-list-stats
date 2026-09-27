(() => {
'use strict';

const style=document.createElement('style');
style.textContent=`
  html,body{height:100%;min-height:0}
  body{height:100dvh;overflow:hidden}
  .window{
    height:calc(100dvh - max(10px,env(safe-area-inset-top)) - max(10px,env(safe-area-inset-bottom)));
    min-height:0;
  }
  .workspace{
    flex:1 1 0;
    min-height:0;
    overflow:auto;
    -webkit-overflow-scrolling:touch;
    overscroll-behavior:contain;
  }

  .chart-frame{
    overflow-x:auto!important;
    overflow-y:hidden!important;
    -webkit-overflow-scrolling:touch;
    overscroll-behavior-x:contain;
  }
  .chart-frame canvas{max-width:none!important}
  #completionBucketsChart{min-width:1050px}
  #trendChart,#backlogChart{min-width:900px}
  #seasonalityChart{min-width:1000px}
  #listShareChart{min-width:900px}
  #weekdayChart{min-width:900px}
  #hourChart{min-width:1500px}
  #depthChart{min-width:650px}
  #taskTypeChart{min-width:1350px}

  .year-heatmap,.month-year-heatmap,.weekday-hour-heatmap{
    width:100%;
    max-width:100%;
    overflow-x:auto;
    -webkit-overflow-scrolling:touch;
  }

  .fun-content .table-wrap,
  .roulette-table-wrap{
    box-shadow:1px 1px 0 #808080;
  }
  .fun-result-box{
    background:transparent!important;
    border:0!important;
    padding:0!important;
  }
  .fun-result-box .table-wrap{margin-top:8px}
  .fun-task-heading,.fun-task-title{padding-left:2px;padding-right:2px}
  .roulette-result{
    background:transparent!important;
    border:0!important;
    box-shadow:none!important;
  }
  .roulette-body{padding:0!important}
  .roulette-heading{margin:0 2px 3px}
  .roulette-task-title{margin:0 2px 9px}
  .roulette-table-wrap{margin-top:8px}

  @media (max-width:780px){
    body{
      height:100dvh;
      padding:max(env(safe-area-inset-top),20px) 4px max(4px,env(safe-area-inset-bottom));
      overflow:hidden;
    }
    .window{
      height:calc(100dvh - max(env(safe-area-inset-top),20px) - max(4px,env(safe-area-inset-bottom)));
      min-height:0;
      width:100%;
    }
    .workspace{overflow:auto}
    .control-row{flex-wrap:wrap;max-width:100%}
    .month-input{max-width:100%;min-width:0}
    .month-calendar{
      width:100%;
      max-width:100%;
      min-width:0;
      grid-template-columns:repeat(7,92px);
      overflow-x:auto;
      overflow-y:hidden;
      -webkit-overflow-scrolling:touch;
      overscroll-behavior-x:contain;
    }
    .calendar-head{min-width:92px}
    .calendar-day{min-width:92px}
    .heat-legend{justify-content:flex-start;min-width:max-content}
  }
`;
document.head.append(style);

document.querySelector('.roulette-titlebar')?.remove();

document.title='Task List Stats v0.8';
const titleNode=document.querySelector('.title-left');if(titleNode)titleNode.textContent='Task List Stats v0.8';
const statusNode=$('#statusLeft');if(statusNode)statusNode.textContent='Task List Stats v0.8';
const about=document.querySelector('#aboutDialog strong');if(about)about.textContent='Task List Stats v0.8';

requestAnimationFrame(()=>{
  try{renderAll();}catch{}
});
})();

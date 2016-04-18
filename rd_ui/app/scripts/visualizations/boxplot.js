(function() {
  var module = angular.module('redash.visualization');

  module.config(['VisualizationProvider', function(VisualizationProvider) {
      var renderTemplate =
        '<boxplot-renderer ' +
        'options="visualization.options" query-result="queryResult">' +
        '</boxplot-renderer>';
      var editTemplate = '<boxplot-editor options="visualization.options" query-result="queryResult"></boxplot-editor>';
      
      var defaultOptions = {
        columnMapping: {}
      };

      VisualizationProvider.registerVisualization({
        type: 'BOXPLOT',
        name: 'Boxplot',
        renderTemplate: renderTemplate,
        editorTemplate: editTemplate,
        defaultOptions: defaultOptions
      });
  }]);

  module.directive('boxplotRenderer', function() {
    return {
      restrict: 'E',
      scope: {
        queryResult: '=',
        options: '='
      },
      templateUrl: '/views/visualizations/boxplot.html',
      link: function($scope, elm, attrs) {

        function iqr(k) {
          return function(d, i) {
            var q1 = d.quartiles[0],
                q3 = d.quartiles[2],
                iqr = (q3 - q1) * k,
                i = -1,
                j = d.length;
            while (d[++i] < q1 - iqr);
            while (d[--j] > q3 + iqr);
            return [i, j];
          };
        }

        $scope.$watch('[queryResult && queryResult.getData(), visualization.options, options]', function() {

          var data = $scope.queryResult.getData($scope.options.columnMapping);

          var parentWidth = d3.select(elm[0].parentNode).node().getBoundingClientRect().width;
          var margin = {top: 10, right: 50, bottom: 40, left: 50, inner: 25},
              width = parentWidth - margin.right - margin.left,
              height = 500 - margin.top - margin.bottom;

          var min = Infinity,
              max = -Infinity;
          var mydata = [];
          var value = 0;
          var d = [];
          var xAxisLabel = $scope.options.xAxisLabel;
          var yAxisLabel = $scope.options.yAxisLabel;

          var columns = $scope.queryResult.columnNames;

          var xAxisColumn = _.invert($scope.options.columnMapping)['x'];
          var yAxisColumn = _.invert($scope.options.columnMapping)['y'];

          if (xAxisColumn && yAxisColumn) {
            columns = [];
            // TODO if underscore >= 1.8.1 is added then mapObject can be used
            _.chain(data).groupBy(xAxisColumn).map(function(row, key) {
              var values = _.pluck(row, yAxisColumn);
              max = d3.max([max, d3.max(values)]);
              min = d3.min([min, d3.min(values)]);
              mydata.push(values);
              columns.push(key);
            });
          } else {
            // Default
            _.each(columns, function(column, i) {
              d = mydata[i] = [];
              _.each(data, function (row) {
                value = row[column];
                d.push(value);
                if (value > max) max = Math.ceil(value);
                if (value < min) min = Math.floor(value);
              });
            });
          }

          var xscale = d3.scale.ordinal()
            .domain(columns)
            .rangeBands([0, parentWidth - margin.left - margin.right]);

          var boxWidth;
          if (columns.length > 1){
            boxWidth = Math.min(xscale(columns[1]), 120.0);
          } else {
            boxWidth = 120.0;
          }
          margin.inner = boxWidth / 3.0;

          var yscale = d3.scale.linear()
            .domain([min * 0.99, max * 1.01])
            .range([height, 0]);

          var chart = d3.box()
            .whiskers(iqr(1.5))
            .width(boxWidth - 2 * margin.inner)
            .height(height)
            .domain([min * 0.99, max * 1.01]);

          var xAxis = d3.svg.axis()
            .scale(xscale)
            .orient('bottom');

          var yAxis = d3.svg.axis()
            .scale(yscale)
            .orient('left');

          var xLines = d3.svg.axis()
            .scale(xscale)
            .tickSize(height)
            .orient('bottom');

          var yLines = d3.svg.axis()
            .scale(yscale)
            .tickSize(width)
            .orient('right');

          var barOffset = function(i) {
            return xscale(columns[i]) + (xscale(columns[1]) - margin.inner) / 2.0;
          };

          d3.select(elm[0]).selectAll('svg').remove();

          var plot = d3.select(elm[0])
            .append('svg')
              .attr('width',parentWidth)
              .attr('height',height + margin.bottom + margin.top)
            .append('g')
              .attr('width',parentWidth - margin.left - margin.right)
              .attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');

          d3.select('svg').append('text')
              .attr('class', 'box')
              .attr('x', parentWidth / 2.0)
              .attr('text-anchor', 'middle')
              .attr('y', height + margin.bottom)
              .text(xAxisLabel);

          d3.select('svg').append('text')
              .attr('class', 'box')
              .attr('transform','translate(10,' + (height + margin.top + margin.bottom) / 2.0 + ')rotate(-90)')
              .attr('text-anchor', 'middle')
              .text(yAxisLabel);

          plot.append('rect')
              .attr('class', 'grid-background')
              .attr('width', width)
              .attr('height', height);

          plot.append('g')
              .attr('class','grid')
              .call(yLines);

          plot.append('g')
              .attr('class', 'grid')
              .call(xLines);

          plot.append('g')
              .attr('class', 'x axis')
              .attr('transform', 'translate(0,' + height + ')')
              .call(xAxis);

          plot.append('g')
              .attr('class', 'y axis')
              .call(yAxis);

          plot.selectAll('.box').data(mydata)
            .enter().append('g')
              .attr('class', 'box')
              .attr('width', boxWidth)
              .attr('height', height)
              .attr('transform', function(d, i) { return 'translate(' + barOffset(i) + ',' + 0 + ')'; } )
              .call(chart); 
        }, true);
      }
    };
  });

  module.directive('boxplotEditor', function() {
    return {
      restrict: 'E',
      templateUrl: '/views/visualizations/boxplot_editor.html',
      scope: {
        queryResult: '=',
        options: '='
      },
      link: function($scope, element, attrs) {
        if (!$scope.options.columnMapping) {
          $scope.options.columnMapping = {};
        }

        var refreshColumns = function() {
          $scope.columns = $scope.queryResult.getColumns();
          $scope.columnNames = _.pluck($scope.columns, 'name');
          if ($scope.columnNames.length > 0) {
            _.each(_.difference(_.keys($scope.options.columnMapping), $scope.columnNames), function(column) {
              delete $scope.options.columnMapping[column];
            });
          }
        };

        refreshColumns();

        var refreshColumnsAndForm = function() {
          refreshColumns();
          if (!$scope.queryResult.getData() || $scope.queryResult.getData().length == 0 || $scope.columns.length == 0) {
            return;
          }
          if (!_.contains($scope.columnNames, $scope.form.xAxisColumn)) {
            $scope.form.xAxisColumn = undefined;
          }
          if (!_.contains($scope.columnNames, $scope.form.yAxisColumn)) {
            $scope.form.yAxisColumn = undefined;
          }
        }

        $scope.$watch(function() {
          return [$scope.queryResult.getId(), $scope.queryResult.status];
        }, function(changed) {
          if (!changed[0] || changed[1] !== "done") {
            return;
          }
          refreshColumnsAndForm();
        }, true);

        $scope.form = {};

        var setColumnRole = function(role, column) {
          $scope.options.columnMapping[column] = role;
        }

        var unsetColumn = function(column) {
          setColumnRole('unused', column);
        }

        $scope.$watch('form.xAxisColumn', function(value, old) {
          if (!_.isUndefined(old)) {
            unsetColumn(old);
          }
          if (!_.isUndefined(value)) {
            setColumnRole('x', value);
          }
        });

        $scope.$watch('form.yAxisColumn', function(value, old) {
          if (!_.isUndefined(old)) {
            unsetColumn(old);
          }
          if (!_.isUndefined(value)) {
            setColumnRole('y', value);
          }
        });

        if ($scope.columnNames) {
          _.each($scope.options.columnMapping, function(value, key) {
            if ($scope.columnNames.length > 0 && !_.contains($scope.columnNames, key)) {
              return;
            }
            if (value == 'x') {
              $scope.form.xAxisColumn = key;
            } else if (value == 'y') {
              $scope.form.yAxisColumn = key;
            }
          });
        }
      }
    }
  });

})();

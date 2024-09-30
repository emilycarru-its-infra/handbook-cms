import React from 'react';
import { List } from 'immutable';
import { css } from '@emotion/react';
import styled from '@emotion/styled';
import { connect } from 'react-redux';
import { NavLink } from 'react-router-dom';
import { stringTemplate } from 'decap-cms-lib-widgets';
import { Icon, colors, components } from 'decap-cms-ui-default';
import PropTypes from 'prop-types';
import ImmutablePropTypes from 'react-immutable-proptypes';
import { sortBy } from 'lodash';

import { selectEntries } from '../../reducers/entries';
import { selectEntryCollectionTitle } from '../../reducers/collections';

const { addFileTemplateFields } = stringTemplate;

const NodeTitleContainer = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
`;

const NodeTitle = styled.div`
  margin-right: 4px;
`;

const Caret = styled.div`
  position: relative;
  top: 2px;
`;

const CaretDown = styled(Caret)`
  ${components.caretDown};
  color: currentColor;
`;

const CaretRight = styled(Caret)`
  ${components.caretRight};
  color: currentColor;
  left: 2px;
`;

const TreeNavLink = styled(NavLink)`
  display: flex;
  font-size: 14px;
  font-weight: 500;
  align-items: center;
  padding: 8px;
  padding-left: ${props => props.depth * 16 + 18}px;
  border-left: 2px solid #fff;

  ${Icon} {
    margin-right: 4px;
    flex-shrink: 0;
  }

  ${props => css`
    &:hover,
    &:active,
    &.${props.activeClassName} {
      color: ${colors.active};
      background-color: ${colors.activeBackground};
      border-left-color: #4863c6;
    }
  `};
`;

function getNodeTitle(node) {
  if (node.isDir) {
    return node.title;
  }
  const title = node.children?.find(c => !c.isDir && c.title)?.title || node.title;
  return title;
}

function TreeNode(props) {
  const { collection, treeData, depth = 0, onToggle } = props;
  const collectionName = collection.get('name');
  const sortedData = sortBy(treeData, getNodeTitle);

  return sortedData.map(node => {
    if (!node.isDir) {
      return null;
    }

    let to = `/collections/${collectionName}`;
    if (depth > 0) {
      // Ensure there's a `/` between `filter` and the folder name
      to = `${to}/filter/${encodeURI(node.path).replace(/%2F/g, '/')}`;
    }

    const title = getNodeTitle(node);
    const hasChildren = node.children && node.children.length > 0;
    node.expanded = true;

    return (
      <React.Fragment key={node.path}>
        <TreeNavLink
          exact
          to={to}
          activeClassName="sidebar-active"
          depth={depth}
          data-testid={node.path}
        >
          <span role="img" aria-label="folder">📁</span>
          <NodeTitleContainer>
            <NodeTitle>{title}</NodeTitle>
          </NodeTitleContainer>
        </TreeNavLink>
        {node.expanded && hasChildren && (
          <TreeNode
            collection={collection}
            depth={depth + 1}
            treeData={node.children}
            onToggle={onToggle}
          />
        )}
      </React.Fragment>
    );
  });
}

TreeNode.propTypes = {
  collection: ImmutablePropTypes.map.isRequired,
  depth: PropTypes.number,
  treeData: PropTypes.array.isRequired,
  onToggle: PropTypes.func.isRequired,
};

export function walk(treeData, callback) {
  function traverse(children) {
    for (const child of children || []) {
      callback(child);
      traverse(child.children);
    }
  }
  return traverse(treeData);
}

function customDirname(p) {
  const parts = p.split('/');
  parts.pop();
  return parts.length ? parts.join('/') : '/';
}

export function filterNestedEntries(path, collectionFolder, entries) {
  return entries.filter(e => {
    const entryPath = e.get('path').replace(collectionFolder + '/', '');
    return entryPath !== '' && entryPath !== '_index.md';
  });
}

export function getTreeData(collection, entries) {
  const collectionFolder = collection.get('folder');
  const rootFolder = '/';

  if (!entries || entries.size === 0) {
    console.warn('Entries are missing or empty');
    return [];
  }

  const entriesObj = entries
    .toJS()
    .map((e, index) => {
      const entryMap = entries.get(index);
      if (!entryMap) return null;
      const title = selectEntryCollectionTitle(collection, entryMap);
      return {
        ...e,
        title,
        isDir: false,
        isRoot: false,
        path: e.path.replace(collectionFolder + '/', ''),
      };
    })
    .filter(Boolean);

  const dirs = entriesObj.reduce((acc, entry) => {
    let dir = customDirname(entry.path);
    while (!acc[dir] && dir && dir !== rootFolder) {
      const parts = dir.split('/');
      acc[dir] = {
        title: parts.pop(),
        path: dir,
        isDir: true,
        isRoot: false,
      };
      dir = parts.join('/');
    }
    return acc;
  }, {});

  const flatData = [
    {
      title: collection.get('label'),
      path: rootFolder,
      isDir: true,
      isRoot: true,
    },
    ...Object.values(dirs),
    ...entriesObj,
  ];

  const parentsToChildren = flatData.reduce((acc, node) => {
    const parent = node.isRoot ? rootFolder : customDirname(node.path);
    if (!acc[parent]) {
      acc[parent] = [];
    }
    acc[parent].push(node);
    return acc;
  }, {});

  const visited = new Set();

  function reducer(acc, node) {
    if (visited.has(node.path)) {
      return acc;
    }

    visited.add(node.path);

    const children = parentsToChildren[node.path]
      ? parentsToChildren[node.path].reduce(reducer, [])
      : [];

    return [...acc, { ...node, children }];
  }

  const treeData = (parentsToChildren[rootFolder] || []).reduce(reducer, []);

  return treeData;
}

export function updateNode(treeData, node, callback) {
  let stop = false;

  function updater(nodes) {
    if (stop) {
      return nodes;
    }
    for (let i = 0; i < nodes.length; i++) {
      if (nodes[i].path === node.path) {
        nodes[i] = callback(node);
        stop = true;
        return nodes;
      }
    }
    nodes.forEach(node => updater(node.children));
    return nodes;
  }

  return updater([...treeData]);
}

export class NestedCollection extends React.Component {
  static propTypes = {
    collection: ImmutablePropTypes.map.isRequired,
    entries: ImmutablePropTypes.list.isRequired,
    filterTerm: PropTypes.string,
  };

  constructor(props) {
    super(props);
    this.state = {
      treeData: getTreeData(this.props.collection, this.props.entries),
      selected: null,
      useFilter: true,
    };
  }

  componentDidUpdate(prevProps) {
    const { collection, entries, filterTerm } = this.props;
    if (
      collection !== prevProps.collection ||
      entries !== prevProps.entries ||
      filterTerm !== prevProps.filterTerm
    ) {
      const expanded = {};
      walk(this.state.treeData, node => {
        if (node.expanded) {
          expanded[node.path] = true;
        }
      });
      const treeData = getTreeData(collection, entries);
      walk(treeData, node => {
        if (expanded[node.path]) {
          node.expanded = true;
        }
      });
      this.setState({ treeData });
    }
  }

  onToggle = ({ node, expanded }) => {
    const treeData = updateNode(this.state.treeData, node, node => ({
      ...node,
      expanded,
    }));
    this.setState({ treeData, selected: node });
  };

  render() {
    const { treeData } = this.state;
    const { collection } = this.props;

    return <TreeNode collection={collection} treeData={treeData} onToggle={this.onToggle} />;
  }
}

function mapStateToProps(state, ownProps) {
  const { collection } = ownProps;
  const entries = selectEntries(state.entries, collection) || List();
  return { entries };
}

export default connect(mapStateToProps, null)(NestedCollection);
